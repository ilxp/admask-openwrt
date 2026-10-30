'use strict';
'require view';
'require rpc';
'require uci';
'require ui';
'require fs';
'require baseclass';

var callServiceList = rpc.declare({
	object: 'service', method: 'list', params: ['name'], expect: { '': {} }
});

// 原生 RPC，瞬间返回，不卡网络
var callInitAction = rpc.declare({
	object: 'rc', method: 'init', params: ['name', 'action'], expect: { result: false }
});

var CA_CERT = '/etc/admask/certs/ca.crt';

return view.extend({
	load: function() {
		return uci.load('admask').then(function() {
			var mainAddr = uci.get('admask', 'main', 'addr') || '0.0.0.0:18080';
			var port = '18080';
			var portMatch = mainAddr.match(/:(\d+)$/);
			if (portMatch) port = portMatch[1];

			var catCmd = 'if [ -f /tmp/admask-' + port + '.status ]; then cat /tmp/admask-' + port + '.status; ' +
			             'elif [ -f /tmp/admask.status ]; then cat /tmp/admask.status; ' +
			             'else echo ""; fi';

			var logCmd = 'cat /var/log/admask-*.log 2>/dev/null | grep "\\[BLOCK\\]" | tail -20';

			return Promise.all([
				uci.load('admask'),
				callServiceList('admask'),
				L.resolveDefault(fs.stat(CA_CERT), null),
				L.resolveDefault(fs.exec('/bin/sh', ['-c', catCmd]), { stdout: '' }),
				L.resolveDefault(fs.exec('/bin/sh', ['-c', logCmd]), { stdout: '' }),
				L.resolveDefault(fs.exec('/bin/sh', ['-c', 'openssl x509 -in ' + CA_CERT + ' -noout -enddate 2>/dev/null || echo ""']), { stdout: '' })
			]);
		});
	},

	render: function(data) {
		var serviceData = data[1] || {};
		var caStat = data[2];
		var statusRaw = ((data[3] || {}).stdout || '').trim();
		var logs = ((data[4] || {}).stdout || '').trim();
		var caEndDate = ((data[5] || {}).stdout || '').trim();

		var stat = null;
		if (statusRaw) {
			try { stat = JSON.parse(statusRaw); } catch (e) {}
		}

		var admask = serviceData.admask || {};
		var instances = admask.instances || {};
		var running = false;
		for (var key in instances) { if (instances[key].running) { running = true; break; } }
		if (!running && stat) running = true; 

		var addr = uci.get('admask', 'main', 'addr') || '0.0.0.0:18080';
		var transparent = uci.get('admask', 'main', 'transparent') === '1' ? _('Transparent Proxy') : _('Explicit Proxy');
		var picker = uci.get('admask', 'main', 'picker') === '1' ? '✅ ' + _('Enabled') : _('Not Enabled');
		var engineCfg = uci.get('admask', 'main', 'adblock_engine') || 'auto';
	
		var fwEnabledVal = uci.get('admask', 'firewall', 'enabled');
		var fwEnabled = (fwEnabledVal === undefined || fwEnabledVal === null || fwEnabledVal === '1');
		var blockQuicVal = uci.get('admask', 'firewall', 'block_quic');
		var blockQuic = (blockQuicVal === undefined || blockQuicVal === null || blockQuicVal === '1');

		var proxyDevices = countEnabled('exclude');
		var subscriptions = countEnabled('source');
		var lastBlock = parseLastBlock(logs);
		var caStatus = !caStat ? '❌ ' + _('Not Generated') : '✅ ' + _('Valid');
		var caExpiry = formatCAExpiry(caEndDate);

		var extInstances = uci.sections('admask', 'instance') || [];
		var activeInstances = extInstances.filter(function(i) { return i.enabled === undefined || i.enabled === '1'; }).length;
		var instanceMode = activeInstances > 0 ? _('Multi-instance (%d)').format(activeInstances + 1) : _('Single instance');

		var engineHintBlock = null;
		if (stat && stat.engine_hint) {
			engineHintBlock = E('div', {
				style: 'background: #fcf8e3; border-left: 4px solid #f0ad4e; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;'
			}, [
				E('div', { style: 'font-weight: bold; color: #8a6d3b; margin-bottom: 6px;' },
					'⚠️ ' + _('Filter Engine Warning')),
				E('div', { style: 'color: #8a6d3b;' }, stat.engine_hint),
				E('div', { style: 'color: #666; font-size: 13px; margin-top: 8px;' },
					_('Click "Restart" below to retry, or reboot the device if the issue persists.'))
			]);
		}

		var rows = [
			makeRow(_('Current Status'), running ? E('span', { style: 'color: #28a745;' }, '🟢 ' + _('Running')) : E('span', { style: 'color: #d9534f;' }, '🔴 ' + _('Stopped'))),
			makeRow(_('Running Mode'), transparent),
			makeRow(_('Instance Mode'), instanceMode),
			makeRow(_('Listen Address'), addr),
			makeRow(_('Filter Engine'), formatEngine(stat, engineCfg)),
			makeRow(_('Proxy Firewall'), fwEnabled ? (blockQuic ? '✅ ' + _('Enabled (Blocking QUIC)') : '✅ ' + _('Enabled (Not Blocking QUIC)')) : '❌ ' + _('Closed')),
			makeRow(_('Loaded Rules'), formatRuleCount(stat)),
			makeRow(_('Rule Database Loading'), stat ? (stat.sub_loaded ? E('span', { style: 'color: #28a745;' }, '✅ ' + _('Completed')) : E('span', { style: 'color: #f0ad4e;' }, '⏳ ' + _('Loading'))) : E('span', { style: 'color: #999;' }, '—')),
			makeRow(_('Protected Devices'), _('%d units').format(proxyDevices)),
			makeRow(_('Rule Sources'), _('%d items').format(subscriptions)),
			makeRow(_('CA Certificate'), caStatus),
			makeRow(_('CA Expiry Date'), caExpiry),
			makeRow(_('Element Picker'), picker)
		];

		if (stat) {
			rows.push(makeRow(_('Engine Rules'), _('HLS %d / DASH %d / Mixer %d / VAST %d').format(stat.hls_sites || 0, stat.dash_sites || 0, stat.mixer_rules || 0, stat.vast_rules || 0)));
			if (stat.started_at) rows.push(makeRow(_('Start Time'), stat.started_at));
			if (stat.version) rows.push(makeRow(_('Version'), stat.version));
		}

		if (lastBlock) {
			rows.push(makeRow(_('Recent Blocked Threats'), E('span', { style: 'font-family: monospace; font-size: 12px; color: #d9534f;' }, lastBlock)));
		}

		var body_children = [
			E('h2', {}, _('AdMask Status Overview')),
			E('p', { class: 'cbi-value-description', style: 'margin-bottom: 20px; font-size: 14px;' }, 
				_('AdMask (Adversary Masking) — deeply analyzes network traffic to precisely intercept scams, gambling, phishing, and other malicious sites, blocking threats, purifying the network, and guarding your privacy.'))
		];

		if (engineHintBlock) {
			body_children.push(engineHintBlock);
		}

		body_children.push(
			E('div', { class: 'cbi-section' }, [ E('table', { class: 'table' }, rows) ]),
			E('div', { class: 'cbi-page-actions' }, [
				running ? E('button', { 
					class: 'btn cbi-button cbi-button-negative', 
					click: ui.createHandlerFn(this, 'handleAction', 'stop') 
				}, _('Stop')) : E('button', { 
					class: 'btn cbi-button cbi-button-positive', 
					click: ui.createHandlerFn(this, 'handleAction', 'start') 
				}, _('Start')),
				' ',
				E('button', { 
					class: 'btn cbi-button cbi-button-action', 
					click: ui.createHandlerFn(this, 'handleAction', 'restart') 
				}, _('Restart')),
				' ',
				E('button', { 
					class: 'btn cbi-button', 
					click: ui.createHandlerFn(this, 'handleAction', 'reload') 
				}, _('Reload Config'))
			])
		);

		var body = E('div', { class: 'cbi-map' }, body_children);
		return body;
	},

	handleAction: function(action) {
		var actionStr = _('Unknown');
		if (action === 'start') actionStr = _('Start');
		if (action === 'stop') actionStr = _('Stop');
		if (action === 'restart') actionStr = _('Restart');
		if (action === 'reload') actionStr = _('Reload');

		var countdown = 3;
		// ★ 将提示语节点提取出来，方便后续修改文字
		var pMsg = E('p', { style: 'color: #666; font-size: 13px; margin-top: 15px;' }, 
			_('The background process is running. This page will automatically refresh in %d seconds.').format(countdown));

		ui.showModal(_('Operation Initiated'), [
			E('p', {}, _('Executing service operation: %s').format(actionStr)),
			pMsg,
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-action',
					click: function() { window.location.reload(); }
				}, _('Refresh Now'))
			])
		]);

		// ★ 开启 3、2、1 倒计时
		var timer = setInterval(function() {
			countdown--;
			if (countdown > 0) {
				pMsg.textContent = _('The background process is running. This page will automatically refresh in %d seconds.').format(countdown);
			} else {
				clearInterval(timer);
				window.location.reload();
			}
		}, 1000);

		// ★ reload —— 只触发 reload_service，不改 UCI enabled
		if (action === 'reload') {
			return callInitAction('admask', 'reload').catch(function(err) {
				clearInterval(timer); // 出错时停止倒计时
				ui.hideModal();
				ui.addNotification(null, E('p', {}, _('Operation failed: %s').format(err.message || err)), 'error');
			});
		}

		// start / stop / restart —— 修改 UCI enabled + 软链接 + 执行动作
		var newVal = (action === 'start' || action === 'restart') ? '1' : '0';
		var enableCmd = (action === 'stop') ? 'disable' : 'enable';

		var cmd = "uci set admask.main.enabled=" + newVal + " && " +
				"uci commit admask && " +
				"/etc/init.d/admask " + enableCmd;

		return fs.exec('/bin/sh', ['-c', cmd]).then(function() {
			return callInitAction('admask', action);
		}).catch(function(err) {
			clearInterval(timer); // 出错时停止倒计时
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Operation failed: %s').format(err.message || err)), 'error');
		});
	}
});

// ============================================================
// 以下为全局辅助函数
// ============================================================

function formatEngine(stat, engineCfg) {
	if (stat && stat.active_engine) {
		var active = stat.active_engine;
		var path = stat.engine_path || '';
		
		if (active.indexOf('disabled') >= 0 || active.indexOf('fallback') >= 0 || active.indexOf('nil') >= 0) {
			return E('span', { style: 'color: #f0ad4e; cursor: help;', title: path ? 'Path: ' + path : '' }, ['⚠️ ', active]);
		}
		if (active === 'adblock-rust') {
			return E('span', { style: 'color: #28a745; cursor: help;', title: path ? 'Path: ' + path : 'Rust Engine' }, ['⚡ adblock-rust ']);
		}
		if (active === 'urlfilter') {
			return E('span', { style: 'color: #28a745; cursor: help;', title: 'Built-in Go Engine' }, _('Go Basic Protection Engine'));
		}
		return E('span', {}, active);
	}
	return E('span', { style: 'color: #f0ad4e;' }, ['🟡 ', engineCfg]);
}

function formatRuleCount(stat) {
	if (!stat || !stat.rule_count) return E('span', { style: 'color: #999;' }, _('(Not loaded yet)'));
	return E('span', { style: 'color: #28a745;' }, _('%s rules').format(Number(stat.rule_count).toLocaleString()));
}

function makeRow(label, value) {
	return E('tr', { class: 'tr' }, [
		E('td', { class: 'td', width: '30%', style: 'color: #666;' }, label),
		E('td', { class: 'td' }, value)
	]);
}

function countEnabled(type) {
	var sections = uci.sections('admask', type) || [];
	var count = 0;
	sections.forEach(function(s) { if (s.enabled === undefined || s.enabled === '1') count++; });
	return count;
}

function parseLastBlock(logs) {
	if (!logs) return null;
	var lines = logs.split('\n');
	for (var i = lines.length - 1; i >= 0; i--) {
		var m = lines[i].match(/\[BLOCK\]\s+(\S+)\s+\(rule:\s*(.+?)\)\s*$/);
		if (m) return m[1] + '  ←  ' + m[2];
	}
	return null;
}

function formatCAExpiry(endDate) {
	if (!endDate) return E('span', { style: 'color: #999;' }, _('(Requires openssl-util package)'));
	var m = endDate.match(/notAfter=(.+)/);
	if (!m) return endDate;
	var d = new Date(m[1]);
	if (isNaN(d.getTime())) return m[1];
	var formatted = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
	return E('span', {}, formatted);
}