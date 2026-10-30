'use strict';
'require view';
'require rpc';
'require fs';
'require ui';
'require baseclass';

var callInitAction = rpc.declare({
	object: 'rc',
	method: 'init',
	params: ['name', 'action'],
	expect: { result: false }
});

var FILE_WHITE = '/etc/admask/rules.d/10-whitelist.txt';
var FILE_BLACK = '/etc/admask/rules.d/20-blacklist.txt';

function autoCloseNotification(message, type) {
	var node = ui.addNotification(null, E('p', {}, message), type);
	if (node) {
		setTimeout(function() {
			var closeBtn = node.querySelector('.btn.cbi-button-remove') || node.querySelector('.alert-close') || node.querySelector('.btn');
			if (closeBtn) closeBtn.click();
		}, 2500);
	}
}

function verifyRestart() {
	return new Promise(function(resolve) { setTimeout(resolve, 2500); })
		.then(function() {
			return fs.read('/tmp/admask.status').then(function(data) {
				if (!data) return;
				try {
					var stat = JSON.parse(data);
					var startTime = new Date(stat.started_at).getTime();
					if (new Date().getTime() - startTime > 5000) {
						throw new Error(_('Service failed to restart! Please check the rule syntax.'));
					}
				} catch(e) {}
			}).catch(function() { return; });
		});
}

return view.extend({
	load: function() {
		return Promise.all([
			fs.read(FILE_WHITE).catch(function() { return ''; }),
			fs.read(FILE_BLACK).catch(function() { return ''; })
		]);
	},

	render: function(data) {
		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('Whitelist & Blacklist Management')),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Whitelist (Trusted Allow)')),
				E('p', { class: 'cbi-value-description' }, _('Syntax: @@||domain^ — Allow this domain and all its subdomains. Used to avoid accidentally blocking legitimate services. Supports ! comments.')),
				E('textarea', {
					id: 'whitelist',
					style: 'width: 100%; height: 300px; font-family: monospace; font-size: 12px; padding: 8px; box-sizing: border-box;',
					spellcheck: 'false'
				}, data[0])
			]),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Blacklist (Force Block)')),
				E('p', { class: 'cbi-value-description' }, _('Syntax: ||domain^ — Block this domain and all its subdomains. You can add scam, malicious, or unwanted websites here. Supports ! comments.')),
				E('textarea', {
					id: 'blacklist',
					style: 'width: 100%; height: 300px; font-family: monospace; font-size: 12px; padding: 8px; box-sizing: border-box;',
					spellcheck: 'false'
				}, data[1])
			]),

			E('div', { class: 'cbi-page-actions' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-positive',
					click: ui.createHandlerFn(this, 'handleSave')
				}, _('Save & Restart'))
			])
		]);
	},

	handleSave: function() {
		var whitelist = document.getElementById('whitelist').value;
		var blacklist = document.getElementById('blacklist').value;
		return Promise.all([
			fs.write(FILE_WHITE, whitelist),
			fs.write(FILE_BLACK, blacklist)
		])
		.then(function() {
			return callInitAction('admask', 'restart').catch(function() { return; });
		})
		.then(verifyRestart)
		.then(function() {
			autoCloseNotification(_('Saved successfully — AdMask has restarted and is effective!'), 'info');
		})
		.catch(function(err) {
			autoCloseNotification(_('Save failed: ') + (err && err.message || err), 'error');
		});
	}
});