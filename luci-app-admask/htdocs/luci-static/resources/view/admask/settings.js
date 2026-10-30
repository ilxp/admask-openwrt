'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require baseclass';

return view.extend({
	load: function() {
		return uci.load('admask');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('admask', _('Basic Settings'), _('AdMask core runtime parameters. Requires service restart to take effect.'));

		s = m.section(form.NamedSection, 'main', 'admask', _('General Parameters'));
		s.anonymous = true;

		// o = s.option(form.Flag, 'enabled', _('Enable'));
		// o.default = '1';
		// o.rmempty = false;

		o = s.option(form.ListValue, 'transparent', _('Running Mode'));
		o.value('1', _('Transparent Proxy'));
		o.value('0', _('Explicit Proxy'));
		o.default = '1';

		o = s.option(form.Value, 'addr', _('Listen Address'));
		o.default = '0.0.0.0:18080';
		o.placeholder = '0.0.0.0:18080';
		o.description = _('Transparent proxy must listen on 0.0.0.0 — do not change to 127.0.0.1. Firewall rules will sync automatically when changing ports.');

		o = s.option(form.ListValue, 'update_interval', _('Rule Source Auto-Update Interval'));
		o.value('6h', _('6 Hours'));
		o.value('12h', _('12 Hours'));
		o.value('24h', _('24 Hours'));
		o.value('168h', _('7 Days'));
		o.default = '24h';

		o = s.option(form.Value, 'max_generic_css_kb', _('Generic CSS Injection Limit'));
		o.datatype = 'integer';
		o.default = '1500';
		o.placeholder = '1500';
		o.description = _('Controls the injection of generic CSS (element hiding rules not bound to a specific host).<br><b>1500</b> (Default, Strongly Recommended): Covers the current 1.2MB measured size while preventing extreme bloat.<br><b>0</b> = Unlimited: Full injection (for desktop / x86).<br><b>Positive number</b> = Manual value (KB).<br>⚠️ Warning: Do NOT set to 500~800! ABP generic rules are "all or nothing"; setting it too low will cause page element hiding to completely fail.<br>Requires restart to take effect.');

		o = s.option(form.ListValue, 'adblock_engine', _('Security Filter Engine'));
		o.value('auto', _('Auto-detect (Default, Recommended)'));
		o.value('none', _('Force built-in Go engine (Disable sub-engine)'));
		o.default = 'auto';
		o.rmempty = false;
		o.description = _('<b>auto</b> (Default): Automatically searches for the <code>adblock-engine</code> binary in the same directory as the main program on startup. Uses Rust core if found, otherwise degrades to built-in Go engine.<br>⚠️ Requires restart to take effect.');
		
		// 上游代理配置
		o = s.option(form.Value, 'upstream_proxy', _('Upstream Proxy'));
		o.placeholder = 'http://127.0.0.1:7890';
		o.description = _('Enter the local HTTP proxy address if you use PassWall. LAN IPs are auto-excluded to prevent loops.<br>Example: <code>http://127.0.0.1:7890</code> (Leave blank for direct).');
		o = s.option(form.Flag, 'no_subs', _('Offline Mode'));
		o.description = _('Do not load online threat intelligence sources — use manual rules only');
		o.default = '0';
		
		o = s.option(form.Value, 'cert_cache', _('Certificate Cache Size'));
		o.datatype = 'uinteger';
		o.default = '256';

		o = s.option(form.Flag, 'verbose', _('Verbose Debug Logs'));
		o.description = _('When enabled (-v), AdMask records massive underlying debug information (e.g., every connection, every allow). ⚠️ This drastically consumes CPU and rapidly bloats the log file. Please keep it OFF for daily use. (Regardless of whether it is enabled, key blocking logs are recorded in /var/log/admask-18080.log and can be viewed on the "Logs" page above.) Only enable temporarily when troubleshooting "Why is a website not opening" or "Why is an ad not blocked".');
		o.default = '0';

		// ===== 调试 dump =====
		o = s.option(form.Flag, 'dump_m3u8', _('Debug dump m3u8'));
		o.description = _('Save every m3u8 playlist to the dump directory (for debugging).');
		o.default = '0';

		o = s.option(form.Flag, 'dump_mixer', _('Debug dump mixer JSON'));
		o.description = _('Save every mixer JSON response to the dump directory (for debugging).');
		o.default = '0';

		o = s.option(form.Value, 'dump_dir', _('Dump Directory'));
		o.default = '/tmp/admask-dump';
		o.placeholder = '/tmp/admask-dump';
		o.description = _('Shared save directory for m3u8 and mixer JSON.<br>⚠️ Only created when any of the dump switches above are turned on.');
		o.depends('dump_m3u8', '1');
		o.depends('dump_mixer', '1');

		o = s.option(form.Value, 'dump_max_files', _('Dump File Count Limit'));
		o.datatype = 'uinteger';
		o.default = '10000';
		o.placeholder = '10000';
		o.description = _('Maximum number of files in the dump directory — triggers cleanup every 100 dumps if exceeded, deleting the oldest half.<br><b>0</b> = Unlimited (⚠️ Long-term operation may fill up disk)<br><b>Positive number</b> = Manual value: users with large disks can increase it (e.g., 50000)<br>Default is 10000 — occupies about 100 MB~1 GB of disk space (depending on file size).');
		o.depends('dump_m3u8', '1');
		o.depends('dump_mixer', '1');

		o = s.option(form.Flag, 'picker', _('Enable Element Picker'));
		o.description = _('Press Ctrl+Shift+E on a page to pick and block any element. When enabled, an extra script is injected into every HTML page — websites may detect the presence of AdMask. Recommended to only enable temporarily when needed.');
		o.default = '0';

		o = s.option(form.Flag, 'video_cdn_passthrough', _('Streaming CDN Passthrough (Performance Optimization)'));
		o.description = _('Media CDN domains bypass security decryption — preserving HTTP/2/3 multiplexing, increasing video loading speed by 2-3 times, and significantly reducing router CPU/memory usage. Cost: trackers/ads on CDN domains are not filtered (actual impact is small — video ads mainly go through API/VAST layers). Disabling it intercepts everything: can filter ads on CDNs, but videos will noticeably slow down due to protocol degradation.');
		o.default = '1';

		return m.render();
	}
});