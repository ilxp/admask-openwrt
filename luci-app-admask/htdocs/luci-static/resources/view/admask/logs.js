'use strict';
'require view';
'require fs';
'require poll';
'require ui';
'require uci';
'require baseclass';

function autoCloseNotification(message, type) {
	var node = ui.addNotification(null, E('p', {}, message), type);
	if (node) {
		setTimeout(function() {
			var closeBtn = node.querySelector('.btn.cbi-button-remove') || node.querySelector('.alert-close') || node.querySelector('.btn');
			if (closeBtn) closeBtn.click();
		}, 2500);
	}
}

return view.extend({
	load: function() {
		return uci.load('admask').then(L.bind(function() {
			return this.fetchLogs();
		}, this));
	},

	fetchLogs: function() {
		var noise = '\\[TPROXY\\] serving h2:|\\[ALLOW\\] |\\[ONRESP\\] |http2: server: error reading preface';
		var mainAddr = uci.get('admask', 'main', 'addr') || '0.0.0.0:18080';
		var mainPort = mainAddr.split(':').pop() || '18080';
		
		var insts = uci.sections('admask', 'instance') || [];
		var activeInsts = insts.filter(function(i) { return i.enabled === undefined || i.enabled === '1'; });

		var files = [];
		// ★ 只读取带端口的日志，彻底摆脱旧文件纠缠
		files.push({ path: '/var/log/admask-' + mainPort + '.log', port: mainPort });
		activeInsts.forEach(function(i) {
			if (i.port && i.port !== mainPort) {
				files.push({ path: '/var/log/admask-' + i.port + '.log', port: i.port });
			}
		});

		var regex = new RegExp(noise);

		var promises = files.map(function(f) {
			return L.resolveDefault(fs.read(f.path), '').then(function(content) {
				if (!content) return [];
				var lines = content.split('\n');
				var out = [];
				for (var i = 0; i < lines.length; i++) {
					var line = lines[i].trim();
					if (!line) continue;
					if (regex.test(line)) continue;
					out.push('[' + f.port + '] ' + line);
				}
				return out;
			});
		});

		return Promise.all(promises).then(function(results) {
			var allLines = [];
			results.forEach(function(lines) {
				allLines = allLines.concat(lines);
			});
			return allLines.slice(-1000).join('\n');
		});
	},

	filterLogs: function(logs, keyword, port) {
		if (!logs) return '';
		var lines = logs.split('\n');
		var out = [];
		var kws = (keyword || '').toLowerCase().split(/\s+/).filter(function(k) { return k; });

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];
			if (!line.trim()) continue;

			if (port) {
				if (line.indexOf('[' + port + ']') !== 0) continue;
			}

			var lower = line.toLowerCase();
			var allMatch = true;
			for (var j = 0; j < kws.length; j++) {
				if (lower.indexOf(kws[j]) < 0) {
					allMatch = false;
					break;
				}
			}
			if (allMatch) out.push(line);
		}
		return out.join('\n');
	},

	render: function(logs) {
		var mainAddr = uci.get('admask', 'main', 'addr') || '0.0.0.0:18080';
		var mainPort = mainAddr.split(':').pop() || '18080';
		var ports = [mainPort];
		
		var insts = uci.sections('admask', 'instance') || [];
		var activeInsts = insts.filter(function(i) { return i.enabled === undefined || i.enabled === '1'; });
		activeInsts.forEach(function(i) {
			if (i.port && ports.indexOf(i.port) === -1) {
				ports.push(i.port);
			}
		});
		ports.sort(function(a, b) { return parseInt(a) - parseInt(b); });

		var emptyHint = _('(No business logs) Logs generate only on block. Enable "Verbose Log" for details.');
		var noMatchHint = _('(No matching results) Use spaces for multiple keywords (AND).');
		
		var self = this;
		var rawLogs = logs || '';
		var lastLogs = null;

		var countLines = function(s) {
			if (!s) return 0;
			var n = 0;
			var parts = s.split('\n');
			for (var i = 0; i < parts.length; i++) {
				if (parts[i].trim()) n++;
			}
			return n;
		};

		var rerender = function() {
			var el = document.getElementById('admask-logs');
			if (!el) return;

			var inp = document.getElementById('admask-log-filter');
			var kw = inp ? inp.value : '';
			
			var sel = document.getElementById('admask-log-port');
			var port = sel ? sel.value : '';

			var filtered = self.filterLogs(rawLogs, kw, port);

			if (!filtered) {
				if (kw.trim() || port) {
					el.textContent = noMatchHint;
				} else {
					el.textContent = rawLogs || emptyHint;
				}
			} else {
				el.textContent = filtered;
			}

			updateCounter(countLines(rawLogs), countLines(filtered));
		};

		var updateCounter = function(baseCount, shownCount) {
			var counter = document.getElementById('admask-log-count');
			if (!counter) return;
			var inp = document.getElementById('admask-log-filter');
			var kw = inp ? inp.value.trim() : '';
			var sel = document.getElementById('admask-log-port');
			var port = sel ? sel.value : '';
			
			if (kw || port) {
				counter.textContent = _('Filtered: ') + shownCount + _(' lines / Total ') + baseCount + _(' lines');
			} else {
				counter.textContent = _('Total ') + baseCount + _(' lines');
			}
		};

		var initialDisplay = rawLogs || emptyHint;

		var pre = E('pre', {
			id: 'admask-logs',
			style: 'width: 100%; height: 600px; overflow: auto; background: #1e1e1e; color: #d4d4d4; padding: 10px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;'
		}, initialDisplay);

		var options = [ E('option', { value: '' }, _('All Instances')) ];
		ports.forEach(function(p) {
			options.push(E('option', { value: p }, ':' + p));
		});

		var portSelect = E('select', {
			id: 'admask-log-port',
			style: 'padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px;',
			change: function() { rerender(); }
		}, options);

		var filterInput = E('input', {
			type: 'text',
			id: 'admask-log-filter',
			placeholder: _('Filter keywords (space separated, AND logic)'),
			style: 'width: 250px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px;',
			oninput: function() { rerender(); }
		});

		var clearFilterBtn = E('button', {
			class: 'btn cbi-button',
			style: 'margin-left: 8px',
			click: function() {
				var inp = document.getElementById('admask-log-filter');
				if (inp) inp.value = '';
				var sel = document.getElementById('admask-log-port');
				if (sel) sel.value = '';
				rerender();
			}
		}, _('Clear Filter'));

		var copyLogBtn = E('button', {
			class: 'btn cbi-button cbi-button-action',
			style: 'margin-left: 8px',
			click: function() {
				var el = document.getElementById('admask-logs');
				if (!el) return;
				var text = el.textContent;
				
				if (!text || text === emptyHint || text === noMatchHint) {
					autoCloseNotification(_('Nothing to copy'), 'warning');
					return;
				}

				if (navigator.clipboard && window.isSecureContext) {
					navigator.clipboard.writeText(text).then(function() {
						autoCloseNotification(_('Logs copied to clipboard'), 'info');
					}).catch(function() {
						autoCloseNotification(_('Copy failed'), 'error');
					});
				} else {
					var ta = document.createElement('textarea');
					ta.value = text;
					ta.style.position = 'fixed';
					ta.style.left = '-999999px';
					ta.style.top = '-999999px';
					document.body.appendChild(ta);
					ta.focus();
					ta.select();
					try {
						document.execCommand('copy');
						autoCloseNotification(_('Logs copied to clipboard'), 'info');
					} catch (err) {
						autoCloseNotification(_('Copy failed'), 'error');
					}
					document.body.removeChild(ta);
				}
			}
		}, _('Copy Logs'));

		var clearLogBtn = E('button', {
			class: 'btn cbi-button cbi-button-remove',
			style: 'margin-left: 8px',
			click: function() {
			var msg1 = _('Are you sure you want to clear all business logs?');
			var msg2 = _('This operation cannot be undone and will free up memory space.');
			if (!confirm(msg1 + '\n' + msg2)) {
				return;
			}
				var clearCmd = 'for f in /var/log/admask*.log; do if [ -f "$f" ]; then true > "$f"; fi; done';
				return fs.exec('/bin/sh', ['-c', clearCmd]).then(function() {
					rawLogs = '';
					lastLogs = '';
					rerender();
					var el = document.getElementById('admask-logs');
					if (el) el.scrollTop = 0;
					autoCloseNotification(_('Logs completely cleared'), 'info');
				}).catch(function(err) {
					autoCloseNotification(_('Clear failed: ') + (err && err.message || err), 'error');
				});
			}
		}, _('Clear Logs'));

		var refreshBtn = E('button', {
			class: 'btn cbi-button cbi-button-apply',
			click: function() {
				return self.fetchLogs().then(function(newLogs) {
					rawLogs = newLogs || '';
					lastLogs = rawLogs;
					rerender();
					var el = document.getElementById('admask-logs');
					if (el) el.scrollTop = el.scrollHeight;
					autoCloseNotification(_('Refreshed'), 'info');
				});
			}
		}, _('Refresh'));

		var scrollBtn = E('button', {
			class: 'btn cbi-button',
			style: 'margin-left: 8px',
			click: function() {
				var el = document.getElementById('admask-logs');
				if (el) el.scrollTop = el.scrollHeight;
			}
		}, _('Jump to Latest'));

		var countLabel = E('span', {
			id: 'admask-log-count',
			style: 'margin-left: 12px; color: #666; font-size: 12px; vertical-align: middle;'
		}, _('Total ') + countLines(logs) + _(' lines'));

		var body = E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('Business Logs')),
				
			E('p', { class: 'cbi-value-description', style: 'margin-bottom: 15px;' }, 
				_('To view system initialization logs (firewall rules, DNS configuration, and multi-instance assignment), please check /var/log/admask.log via SSH.')),

			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-page-actions', style: 'display: flex; align-items: center; flex-wrap: wrap; gap: 8px;' }, [
					E('label', { style: 'font-size: 12px; color: #666; margin-right: 4px;' }, _('Instance') + ':'),
					portSelect,
					E('span', { style: 'margin-left: 8px;' }),
					E('label', { style: 'font-size: 12px; color: #666; margin-right: 4px;' }, _('Filter') + ':'),
					filterInput,
					clearFilterBtn,
					E('span', { style: 'flex: 1;' }),
					copyLogBtn,
					clearLogBtn,
					refreshBtn,
					scrollBtn,
					countLabel
				])
			]),
			E('div', { class: 'cbi-section' }, [pre])
		]);

		poll.add(function() {
			return self.fetchLogs().then(function(newLogs) {
				if (newLogs === lastLogs) return;
				lastLogs = newLogs;
				rawLogs = newLogs || '';
				var el = document.getElementById('admask-logs');
				if (!el) return;
				var atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30;
				rerender();
				if (atBottom) {
					el.scrollTop = el.scrollHeight;
				}
			});
		}, 5);

		return body;
	}
});