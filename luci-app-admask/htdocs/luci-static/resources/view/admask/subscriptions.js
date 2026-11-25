'use strict';
'require view';
'require form';
'require uci';
'require baseclass';

return view.extend({
	load: function() {
		return uci.load('admask').then(function() {
			// 1. 把配置文件里之前丢失 type 的规则源在内存中补全
			var sources = uci.sections('admask', 'source') || [];
			sources.forEach(function(s) {
				if (!s.type) {
					uci.set('admask', s['.name'], 'type', 'remote');
				}
			});
		});
	},

	render: function() {
		var m, s, o;

		m = new form.Map('admask', _('Rule Subscriptions'),
			_('Configure ABP rule subscription sources. You can add anti-fraud, malicious blocking, or basic ad-blocking rules. Requires service restart to take effect.'));

		s = m.section(form.GridSection, 'source', _('Rule Sources'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'name', _('Name'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'type', _('Type'));
		o.value('remote', _('Online Subscription'));
		o.value('file', _('Local File'));
		o.default = 'remote';
		o.rmempty = false;
		
		// 2. 界面回显兜底
		o.cfgvalue = function(section_id) {
			return uci.get('admask', section_id, 'type') || 'remote';
		};
		
		// 3. 渲染时强行注入内存（防止 GridSection 新增行时前端默认值不提交的 Bug）
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var node = form.ListValue.prototype.renderWidget.apply(this, arguments);
			if (section_id && !uci.get('admask', section_id, 'type')) {
				uci.set('admask', section_id, 'type', 'remote');
			}
			return node;
		};
		
		// 4. 保存时终极兜底
		o.write = function(section_id, value) {
			uci.set('admask', section_id, 'type', value || 'remote');
		};

		o = s.option(form.Value, 'url', _('Subscription URL'));
		o.depends('type', 'remote');
		o.placeholder = 'https://example.com/easylist.txt';
		o.rmempty = false;

		o = s.option(form.Value, 'path', _('Local Path'));
		o.depends('type', 'file');
		o.placeholder = '/etc/admask/custom.txt';
		o.rmempty = false;

		o = s.option(form.Value, 'refresh', _('Update Interval'));
		o.default = '24h';
		o.placeholder = '24h';
		o.description = _('Go duration format: 30m / 6h / 24h / 168h');
		o.rmempty = false;

		return m.render();
	}
});