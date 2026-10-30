'use strict';
'require view';
'require rpc';
'require uci';
'require fs';
'require ui';
'require baseclass';

var callInitAction = rpc.declare({
	object: 'rc',
	method: 'init',
	params: ['name', 'action'],
	expect: { result: false }
});

// ★ 补上自动关闭提示框的函数
function autoCloseNotification(message, type) {
	var node = ui.addNotification(null, E('p', {}, message), type);
	if (node) {
		setTimeout(function() {
			var closeBtn = node.querySelector('.btn.cbi-button-remove') || node.querySelector('.alert-close') || node.querySelector('.btn');
			if (closeBtn) closeBtn.click();
		}, 2500);
	}
}

// ============================================================
// 纯前端 TAR 打包与解包工具 (零系统依赖)
// ============================================================
function createTar(files) {
	var blocks = [];
	var encoder = new TextEncoder();
	for (var name in files) {
		var content = encoder.encode(files[name]);
		var header = new Uint8Array(512);
		var writeString = function(str, offset, length) {
			var bytes = encoder.encode(str);
			header.set(bytes.slice(0, length), offset);
		};
		writeString(name, 0, 100);
		writeString("0000644", 100, 8);
		writeString("0000000", 108, 8);
		writeString("0000000", 116, 8);
		writeString(content.length.toString(8).padStart(11, '0') + ' ', 124, 12);
		writeString(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ', 136, 12);
		writeString("        ", 148, 8);
		writeString("0", 156, 1);
		writeString("ustar  \0", 257, 8);
		var chksum = 0;
		for (var i = 0; i < 512; i++) chksum += header[i];
		writeString(chksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
		blocks.push(header);
		blocks.push(content);
		var padding = 512 - (content.length % 512);
		if (padding < 512) blocks.push(new Uint8Array(padding));
	}
	blocks.push(new Uint8Array(1024));
	var totalLength = blocks.reduce(function(acc, b) { return acc + b.length; }, 0);
	var tar = new Uint8Array(totalLength);
	var offset = 0;
	for (var i = 0; i < blocks.length; i++) {
		tar.set(blocks[i], offset);
		offset += blocks[i].length;
	}
	return tar;
}

function parseTar(arrayBuffer) {
	var view = new Uint8Array(arrayBuffer);
	var files = {};
	var offset = 0;
	var decoder = new TextDecoder();
	while (offset < view.length - 512) {
		var nameBytes = view.subarray(offset, offset + 100);
		var name = decoder.decode(nameBytes).replace(/\0/g, '').trim();
		if (!name) break;
		var sizeBytes = view.subarray(offset + 124, offset + 136);
		var sizeStr = decoder.decode(sizeBytes).replace(/\0/g, '').trim();
		var size = parseInt(sizeStr, 8);
		if (size > 0) {
			var content = view.subarray(offset + 512, offset + 512 + size);
			files[name] = decoder.decode(content);
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return files;
}

return view.extend({
	load: function() {
		return uci.load('admask').then(L.bind(function() {
			var dir = uci.get('admask', '@admask[0]', 'ca_dir') || '/etc/admask/certs';
			this.caDir = dir.replace(/\/+$/, '');
			return Promise.all([
				L.resolveDefault(fs.stat(this.caDir + '/ca.crt'), null),
				L.resolveDefault(fs.stat(this.caDir + '/ca.key'), null)
			]);
		}, this));
	},

	render: function(data) {
		var caCertStat = data[0];
		var caKeyStat = data[1];
		var certExists = caCertStat && caCertStat.type === 'file';
		var keyExists = caKeyStat && caKeyStat.type === 'file';
		var host = window.location.hostname;

		var body = E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('Certificate Management')),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Root Certificate Status')),
				E('table', { class: 'table' }, [
					E('tr', { class: 'tr' }, [
						E('td', { class: 'td', width: '30%' }, _('Root Certificate (Public Key)')),
						E('td', { class: 'td' }, certExists ? '✅ ' + _('Generated') + ' (' + caCertStat.size + ' ' + _('bytes') + ')' : '❌ ' + _('Not Generated'))
					]),
					E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, _('Root Certificate Private Key')),
						E('td', { class: 'td' }, keyExists ? '✅ ' + _('Generated') + ' (' + caKeyStat.size + ' ' + _('bytes') + ')' : '❌ ' + _('Not Generated'))
					]),
					(certExists && keyExists) ? E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, _('Status')),
						E('td', { class: 'td', style: 'color: #28a745;' }, '✅ ' + _('Running Normally'))
					]) : E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, _('Status')),
						E('td', { class: 'td', style: 'color: #d9534f;' }, '⚠️ ' + _('Certificate not fully generated — please restart AdMask in the "Basic Settings" page'))
					])
				]),
				E('div', {
					style: 'margin-top: 15px; padding: 12px; background-color: #d4edda; border-left: 4px solid #28a745; color: #155724; font-weight: bold; border-radius: 3px;'
				}, '💡 ' + _('Strongly Recommended: Once the certificate is generated, please immediately download a migration backup in Step 2. If you reinstall the system later, simply restore the backup so all client devices won\'t need to reinstall certificates!'))
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('1. Download Client CA Certificate')),
				E('p', { class: 'cbi-value-description' }, _('Install the Root CA on client devices so AdMask can decrypt and analyze traffic.')),
				E('a', {
					href: '/ca.crt',
					download: 'admask-ca.crt',
					class: 'btn cbi-button cbi-button-action',
					style: 'padding: 15px 40px; font-size: 16px; text-decoration: none; display: inline-block;'
				}, '📥 ' + _('Download Root CA (.crt)')),
				
				// ★ 修复空格导致的翻译失效：空格写在括号外
				E('div', { style: 'margin-top: 15px; font-size: 13px; color: #666;' }, [
					_('Direct URL:'), ' ', E('code', {}, 'http://' + host + '/ca.crt'),
					E('br'),
					_('Need the full certificate chain (Root + Intermediate) for older devices?'), ' ',
					E('a', {
						href: 'javascript:void(0)',
						style: 'color: #1a73e8; text-decoration: underline;',
						click: ui.createHandlerFn(this, 'handleBackup')
					}, _('Download Bundle (.tar)'))
				])
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('2. Migration & Backup')),
				E('p', { class: 'cbi-value-description', style: 'color: #d9534f; font-weight: bold;' },
					'⚠️ ' + _('Contains CA PRIVATE KEY — anyone with this file can decrypt ALL HTTPS traffic on your network!')),
				E('p', { class: 'cbi-value-description' },
					_('Only use when migrating AdMask to a new router or reinstalling firmware. NOT for client certificate installation. Generated on-demand — NEVER stored on the router.')),
				
				E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; align-items: center;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-negative',
						click: ui.createHandlerFn(this, 'handleMigrationBackup')
					}, '🔐 ' + _('Download Migration Backup')),
					
					E('input', {
						type: 'file',
						id: 'restore-file',
						accept: '.tar',
						style: 'display: none;',
						change: ui.createHandlerFn(this, 'handleRestore')
					}),
					E('button', {
						class: 'btn cbi-button cbi-button-action',
						style: 'background-color: #5bc0de; border-color: #46b8da; color: #fff;',
						click: function() {
							document.getElementById('restore-file').click();
						}
					}, '⬆️ ' + _('Restore from Backup'))
				])
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('3. Regenerate Root CA (Dangerous)')),
				E('p', { class: 'cbi-value-description', style: 'color: #d9534f;' }, _('After regeneration, all devices will need to reinstall the new CA certificate, otherwise they will lose internet access!')),
				E('button', {
					class: 'btn cbi-button cbi-button-negative',
					click: ui.createHandlerFn(this, 'handleRegenerate')
				}, '🔄 ' + _('Regenerate CA'))
			])
		]);

		return body;
	},

	handleBackup: function() {
		return Promise.all([
			fs.read(this.caDir + '/ca.crt').catch(function() { return ''; }),
			fs.read(this.caDir + '/ca-intermediate.crt').catch(function() { return ''; })
		]).then(function(res) {
			var files = {};
			if (res[0]) files['ca.crt'] = res[0];
			if (res[1]) files['ca-intermediate.crt'] = res[1];
			if (Object.keys(files).length === 0) throw new Error(_('CA file missing'));

			var tarData = createTar(files);
			var blob = new Blob([tarData], { type: 'application/x-tar' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = 'admask-ca-public-' + new Date().toISOString().slice(0, 10) + '.tar';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
			autoCloseNotification(_('Public key bundle downloaded'), 'info');
		}).catch(function(err) {
			autoCloseNotification(_('Backup failed:'), 'error', ' ' + (err.message || err));
		});
	},

	handleMigrationBackup: function() {
		if (!confirm(_('Full backup contains your CA PRIVATE KEY. Anyone with this file can decrypt all HTTPS traffic on your network. Continue?'))) {
			return Promise.resolve();
		}

		return Promise.all([
			fs.read(this.caDir + '/ca.crt').catch(function() { return ''; }),
			fs.read(this.caDir + '/ca.key').catch(function() { return ''; }),
			fs.read(this.caDir + '/ca-intermediate.crt').catch(function() { return ''; }),
			fs.read(this.caDir + '/ca-intermediate.key').catch(function() { return ''; })
		]).then(function(res) {
			if (!res[0] || !res[1]) throw new Error(_('CA files missing'));
			var files = {
				'ca.crt': res[0],
				'ca.key': res[1]
			};
			if (res[2]) files['ca-intermediate.crt'] = res[2];
			if (res[3]) files['ca-intermediate.key'] = res[3];

			var tarData = createTar(files);
			var blob = new Blob([tarData], { type: 'application/x-tar' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = 'admask-ca-migration-' + new Date().toISOString().slice(0, 10) + '.tar';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
			autoCloseNotification(_('Migration backup downloaded. STORE SECURELY!'), 'info');
		}).catch(function(err) {
			autoCloseNotification(_('Migration backup failed:'), 'error', ' ' + (err.message || err));
		});
	},

	handleRestore: function() {
		var fileInput = document.getElementById('restore-file');
		var file = fileInput.files && fileInput.files[0];
		if (!file) {
			autoCloseNotification(_('Please select a backup file first'), 'warning');
			return Promise.resolve();
		}
		if (!confirm(_('Restore will overwrite the current CA. Are you sure you want to continue?'))) {
			fileInput.value = '';
			return Promise.resolve();
		}

		autoCloseNotification(_('Uploading and restoring, please wait...'), 'info');

		return new Promise(function(resolve, reject) {
			var reader = new FileReader();
			reader.onload = function(e) {
				try {
					var files = parseTar(e.target.result);
					resolve(files);
				} catch (err) {
					reject(new Error(_('Invalid backup file format. Only .tar files are supported.')));
				}
			};
			reader.onerror = function() { reject(new Error(_('Failed to read file'))); };
			reader.readAsArrayBuffer(file);
		})
		.then(L.bind(function(files) {
			var p = [];
			var dir = this.caDir;
			if (files['ca.crt']) p.push(fs.write(dir + '/ca.crt', files['ca.crt']));
			if (files['ca.key']) p.push(fs.write(dir + '/ca.key', files['ca.key']));
			if (files['ca-intermediate.crt']) p.push(fs.write(dir + '/ca-intermediate.crt', files['ca-intermediate.crt']));
			if (files['ca-intermediate.key']) p.push(fs.write(dir + '/ca-intermediate.key', files['ca-intermediate.key']));
			return Promise.all(p);
		}, this))
		.then(L.bind(function() {
			return fs.exec('/bin/sh', ['-c', 
				'chmod 700 "' + this.caDir + '"; ' +
				'chmod 600 "' + this.caDir + '/*.key" 2>/dev/null; ' +
				'chmod 644 "' + this.caDir + '/*.crt" 2>/dev/null; ' +
				'rm -f /www/ca.crt /www/admask-ca-backup.tar.gz'
			]).catch(function() { return; });
		}, this))
		.then(function() {
			return callInitAction('admask', 'restart').catch(function() { return; });
		})
		.then(function() {
			autoCloseNotification(_('✅ Processing complete, AdMask is restarting...'), 'info');
			setTimeout(function() { location.reload(); }, 3000);
		})
		.catch(function(err) {
			autoCloseNotification(_('Restore failed:'), 'error', ' ' + (err.message || err));
		});
	},

	handleRegenerate: function() {
		if (!confirm(_('Are you sure you want to regenerate the CA?'))) return Promise.resolve();
		if (prompt(_('Type "REGENERATE" to confirm: ')) !== 'REGENERATE') return Promise.resolve();

		return fs.exec('/bin/sh', ['-c',
			'rm -rf "' + this.caDir + '" /www/ca.crt /www/admask-ca-backup.tar.gz'
		])
			.then(function() { return callInitAction('admask', 'restart').catch(function() { return; }); })
			.then(function() {
				autoCloseNotification(_('CA regenerated, restarting...'), 'info');
				setTimeout(function() { location.reload(); }, 3000);
			});
	}
});