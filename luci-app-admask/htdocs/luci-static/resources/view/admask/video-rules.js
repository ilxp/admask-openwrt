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

var TARGET = '/etc/admask/video-service-rules.yaml';

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
						throw new Error(_('Service failed to restart! Please check the YAML syntax.'));
					}
				} catch(e) {}
			}).catch(function() { return; });
		});
}

return view.extend({
	load: function() {
		return fs.read(TARGET).catch(function() { return ''; });
	},

	render: function(content) {
		var textarea = E('textarea', {
			id: 'video-rules',
			style: 'width:100%;height:500px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;',
			spellcheck: 'false'
		}, content || '');

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, _('Video Service Rules')),
			E('p', { class: 'cbi-value-description' }, _('Deep filtering for video services, including API response interception and streaming ad blocking.')),
			E('div', { class: 'cbi-section' }, [textarea]),
			E('div', { class: 'cbi-page-actions' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-positive',
					click: ui.createHandlerFn(this, 'handleSave')
				}, _('Save & Restart'))
			])
		]);
	},

	handleSave: function() {
		var content = document.getElementById('video-rules').value;
		return fs.write(TARGET, content)
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