'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require baseclass';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('admask'),
			L.resolveDefault(fs.read('/tmp/dhcp.leases'), ''),
			L.resolveDefault(fs.read('/proc/net/arp'), ''),
			L.resolveDefault(fs.exec('/bin/sh', ['-c',
				"ip -6 neigh show dev br-lan 2>/dev/null"
			]), { stdout: '' }),
			L.resolveDefault(fs.exec('/bin/sh', ['-c',
				"ip -4 -o addr show br-lan 2>/dev/null | awk '{print $4}' | head -1"
			]), { stdout: '' }),
			L.resolveDefault(fs.exec('/bin/sh', ['-c',
				"ip -6 addr show br-lan 2>/dev/null | awk '/inet6/ && !/fe80/ {print $2; exit}'"
			]), { stdout: '' }),
			L.resolveDefault(fs.exec('/bin/sh', ['-c',
				'nft list table inet admask 2>/dev/null || echo ""'
			]), { stdout: '' })
		]);
	},

	render: function(data) {
		var m, s, o;
		var dhcpData  = data[1] || '';
		var arpData   = data[2] || '';
		var ip6Neigh  = (data[3] || {}).stdout || '';
		var lanCIDR4  = ((data[4] || {}).stdout || '').trim() || _('Not detected');
		var lanCIDR6  = ((data[5] || {}).stdout || '').trim() || _('Not detected (No public IPv6)');
		var nftRaw = ((data[6] || {}).stdout || '').trim() || _('No nft rules currently active.');
		var devices   = this.parseDevices(dhcpData, arpData, ip6Neigh);

		m = new form.Map('admask', _('Access Control'),
			_('Select which devices/networks use AdMask. All sources are randomly distributed among all instances by default — each connection is randomly assigned to an instance by nft for automatic load balancing.'));

		// ═══════════════════════════════════════════════
		// 1. Global Settings
		// ═══════════════════════════════════════════════
		s = m.section(form.NamedSection, 'firewall', 'firewall', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable Proxy'));
		o.default = '1';
		o.rmempty = false;
		o.description = _('Master switch — when disabled, traffic from all devices bypasses AdMask.');

		o = s.option(form.DummyValue, '_lan_view4', _('LAN Subnet (IPv4)'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return E('code', {
				style: 'background: #f5f5f5; padding: 4px 8px; border-radius: 3px; font-size: 13px;'
			}, lanCIDR4);
		};

		o = s.option(form.DummyValue, '_lan_view6', _('LAN Subnet (IPv6)'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return E('code', {
				style: 'background: #f5f5f5; padding: 4px 8px; border-radius: 3px; font-size: 13px;'
			}, lanCIDR6);
		};

		o = s.option(form.Flag, 'block_quic', _('Block QUIC Protocol'));
		o.default = '1';
		o.description = _('Block UDP 443 — prevents malware or websites from bypassing the security gateway via QUIC');

		// ═══════════════════════════════════════════════
		// 2. Extra Instances
		// ═══════════════════════════════════════════════
		s = m.section(form.GridSection, 'instance', _('Extra Instances'),
			_('Extra instances — additional AdMask processes besides \'main\'. The \'main\' instance listens on the configured address and cannot be deleted. All protected sources are distributed among all instances (including \'main\') by default.'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = '1';
		o.rmempty = false;
		o.width = '6em';

		o = s.option(form.Value, 'port', _('Port'));
		o.datatype = 'port';
		o.rmempty = false;
		o.placeholder = '18081';
		o.width = '8em';
		o.description = _('Must differ from the main port and not conflict with other extra instances.');

		o.cfgvalue = function(section_id) {
			var v = uci.get('admask', section_id, 'port');
			return v || '';
		};

		// ═══════════════════════════════════════════════
		// 3. Protected Sources
		// ═══════════════════════════════════════════════
		s = m.section(form.GridSection, 'exclude', _('Protected Sources'),
			_('Protected Sources — matching traffic passes through AdMask. Supports MAC / IPv4 / IPv6 / CIDR (auto-detected). Protected devices must install the Root CA certificate.'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = '1';
		o.rmempty = false;
		o.width = '6em';

		o = s.option(form.Value, 'comment', _('Name'));
		o.placeholder = _('(Optional)');
		o.width = '10em';

		o = s.option(form.Value, 'source', _('Source'),
			_('MAC / IPv4 / IPv6 / CIDR — auto-detected formats:<br>' +
			  '<code>aa:bb:cc:dd:ee:ff</code> → MAC<br>' +
			  '<code>192.168.1.50</code> → IPv4<br>' +
			  '<code>192.168.3.0/24</code> → IPv4 CIDR<br>' +
			  '<code>2001:db8::1</code> → IPv6<br>' +
			  '<code>2001:db8::/64</code> → IPv6 CIDR'));
		o.rmempty = false;
		o.width = '24em';
		o.placeholder = _('aa:bb:cc:dd:ee:ff or 192.168.3.0/24');

		o.cfgvalue = function(section_id) {
			var v = uci.get('admask', section_id, 'source');
			if (!v) v = uci.get('admask', section_id, 'value');
			return v || '';
		};
		o.write = function(section_id, value) {
			uci.set('admask', section_id, 'source', value);
		};

		// ★ 完美校验：拦截乱填的格式（MAC / IPv4 / IPv6 / CIDR）
		o.validate = function(section_id, value) {
			if (!value) return true; // 留空交给 rmempty 处理
			
			value = value.trim();
			
			// 1. 匹配 MAC (aa:bb:cc:dd:ee:ff 或 aa-bb-cc-dd-ee-ff)
			var isMac = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value);
			
			// 2. 匹配 IPv4 (192.168.1.50) 或 IPv4 CIDR (192.168.3.0/24)
			var isV4 = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/[0-9]{1,2})?$/.test(value);
			
			// 3. 匹配 IPv6 (2001:db8::1) 或 IPv6 CIDR (2001:db8::/64)
			var isV6 = /^[0-9a-fA-F:]+(\/[0-9]{1,3})?$/.test(value) && value.indexOf(':') !== -1 && value !== ':';
			
			if (isMac || isV4 || isV6) {
				return true;
			}
			
			return _('Invalid format: please enter a valid MAC, IPv4, IPv6, or CIDR address');
		};

		// ★ 终极体验：原生 <datalist>
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var inputNode = form.Value.prototype.renderWidget.apply(this, arguments);
			var realInput = inputNode.tagName === 'INPUT' ? inputNode : inputNode.querySelector('input');
			if (!realInput) realInput = inputNode;

			if (devices.length === 0) {
				return inputNode;
			}

			var listId = 'admask-dl-' + (section_id || 'new') + '-' + Math.floor(Math.random() * 10000);
			
			realInput.setAttribute('list', listId);
			realInput.setAttribute('autocomplete', 'off');
			realInput.style.width = '100%';
			realInput.style.boxSizing = 'border-box';

			var datalist = E('datalist', { id: listId });
			devices.forEach(function(d) {
				var macStr = d.mac || '';
				var ipStr  = d.ip  || '';
				var name   = d.name ? (' | ' + d.name) : '';
				var key    = macStr || ipStr;
				var family = d.v6 ? '[IPv6] ' : '';
				var label  = family + (macStr ? macStr : _('No MAC')) + name + ' (' + ipStr + ')';
				
				datalist.appendChild(E('option', { 
					value: key, 
					label: label 
				}));
			});

			return E('div', { style: 'width: 100%;' }, [
				inputNode,
				datalist
			]);
		};

		o = s.option(form.ListValue, 'family', _('Protocol'));
		o.value('both', _('IPv4 + IPv6'));
		o.value('ipv4', _('IPv4 Only'));
		o.value('ipv6', _('IPv6 Only'));
		o.default = 'both';
		o.rmempty = false;
		o.width = '9em';
		o.description = _('Only applies when source is a MAC — IP/CIDR sources determine the protocol inherently.');

		o = s.option(form.ListValue, 'mode', _('Ports'));
		o.value('off',   _('Do Not Intercept'));
		o.value('http',  _('HTTP (80)'));
		o.value('https', _('HTTP + HTTPS'));
		o.value('all',   _('All Ports'));
		o.default = 'https';
		o.rmempty = false;
		o.width = '11em';

		// ═══════════════════════════════════════════════
		// 4. Runtime nftables Rules（底部）
		// ═══════════════════════════════════════════════
		var nftBox = E('div', { class: 'cbi-map', style: 'margin-top: 30px;' }, [
			E('h3', {}, _('Runtime nftables Rules')),
			E('p', { class: 'cbi-value-description' },
				_('Below are the active nftables rules in the kernel — traffic is matched exactly by MAC / IP and randomly distributed across all instances.')),
			E('pre', {
				style: 'background: #1e1e1e; color: #d4d4d4; padding: 15px; ' +
					'border-radius: 5px; font-family: monospace; font-size: 12px; ' +
					'overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; ' +
					'box-shadow: inset 0 0 10px rgba(0,0,0,0.5);'
			}, nftRaw)
		]);

		return m.render().then(function(formView) {
			return E('div', [formView, nftBox]);
		});
	},

	parseDevices: function(dhcp, arp, ip6neigh) {
		var map = {};

		dhcp.split('\n').forEach(function(line) {
			var parts = line.trim().split(/\s+/);
			if (parts.length < 4) return;
			var mac = parts[1].toLowerCase();
			var ip = parts[2];
			var name = parts[3] !== '*' ? parts[3] : '';
			if (!ip) return;
			map[ip] = { ip: ip, mac: mac, name: name, v6: false };
		});

		arp.split('\n').forEach(function(line, idx) {
			if (idx === 0) return;
			var parts = line.trim().split(/\s+/);
			if (parts.length < 6) return;
			var ip = parts[0];
			var mac = parts[3].toLowerCase();
			if (mac === '00:00:00:00:00:00') return;
			if (map[ip]) {
				if (!map[ip].mac) map[ip].mac = mac;
			} else {
				map[ip] = { ip: ip, mac: mac, name: '', v6: false };
			}
		});

		(ip6neigh || '').split('\n').forEach(function(line) {
			var parts = line.trim().split(/\s+/);
			if (parts.length < 5) return;
			if (parts[3] !== 'lladdr') return;

			var ip = parts[0];
			var mac = parts[4].toLowerCase();
			if (!ip || !mac) return;
			if (mac === '00:00:00:00:00:00') return;
			if (/^fe80:/i.test(ip)) return;
			if (/^ff0/i.test(ip)) return;

			if (map[ip]) {
				if (!map[ip].mac) map[ip].mac = mac;
			} else {
				map[ip] = { ip: ip, mac: mac, name: '', v6: true };
			}
		});

		var out = [];
		Object.keys(map).forEach(function(ip) { out.push(map[ip]); });

		// 1. 排序
		out.sort(function(a, b) {
			var aIsV4 = !a.v6;
			var bIsV4 = !b.v6;
			if (aIsV4 !== bIsV4) return aIsV4 ? -1 : 1;

			if (aIsV4) {
				var ai = a.ip.split('.').map(Number);
				var bi = b.ip.split('.').map(Number);
				for (var i = 0; i < 4; i++) {
					if (ai[i] !== bi[i]) return ai[i] - bi[i];
				}
				return 0;
			}

			return a.ip.localeCompare(b.ip);
		});

		// 2. 按 MAC 去重
		var uniqueMap = {};
		out.forEach(function(d) {
			var key = d.mac || d.ip;
			if (!uniqueMap[key]) {
				uniqueMap[key] = d;
			} else {
				if (!uniqueMap[key].name && d.name) {
					uniqueMap[key].name = d.name;
				}
				if (!d.v6 && uniqueMap[key].v6) {
					uniqueMap[key].ip = d.ip;
					uniqueMap[key].v6 = false;
				}
			}
		});

		var finalOut = [];
		Object.keys(uniqueMap).forEach(function(k) { finalOut.push(uniqueMap[k]); });
		return finalOut;
	}
});