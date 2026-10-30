'use strict';
'require view';
'require form';
'require uci';
'require baseclass';

return view.extend({
	load: function() {
		return uci.load('admask');
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

		o = s.option(form.Value, 'url', _('Subscription URL'));
		o.depends('type', 'remote');
		o.placeholder = 'https://example.com/easylist.txt';

		o = s.option(form.Value, 'path', _('Local Path'));
		o.depends('type', 'file');
		o.placeholder = '/etc/admask/custom.txt';

		o = s.option(form.Value, 'refresh', _('Update Interval'));
		o.default = '24h';
		o.placeholder = '24h';
		o.description = _('Go duration format: 30m / 6h / 24h / 168h');
		o.rmempty = false;

		return m.render();
	}
});