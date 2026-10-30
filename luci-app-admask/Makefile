include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-admask
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI app for AdMask
LUCI_DESCRIPTION:=LuCI Web interface for AdMask. Configure security rules, manage CA certs, and monitor logs.
LUCI_DEPENDS:=+luci-base +admask
LUCI_PKGARCH:=all

define Package/luci-app-admask/install
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/admask $(1)/usr/libexec/rpcd/admask

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-admask.json $(1)/usr/share/rpcd/acl.d/luci-app-admask.json

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-admask.json $(1)/usr/share/luci/menu.d/luci-app-admask.json

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/admask
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/admask/*.js $(1)/www/luci-static/resources/view/admask/
	
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-admask $(1)/etc/uci-defaults/99-admask
endef

define Package/luci-app-admask/postrm
#!/bin/sh

if [ "$${1}" = "remove" ] || [ "$${1}" = "purge" ]; then
	# 清理后端接口和权限
	rm -f /usr/libexec/rpcd/admask
	rm -f /usr/share/rpcd/acl.d/luci-app-admask.json
	rm -f /usr/share/luci/menu.d/luci-app-admask.json
	
	# 清理前端静态资源
	rm -rf /www/luci-static/resources/view/admask
	
	# 注销 ucitrack（安全地静默删除）
	[ -f "/etc/config/ucitrack" ] && {
		uci -q batch <<-EOF >/dev/null
		delete ucitrack.@admask[-1]
		commit ucitrack
		EOF
	}
	
	# 刷新 LuCI 缓存
	rm -f /tmp/luci-indexcache*
	rm -rf /tmp/luci-modulecache/
fi

exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk
#$(eval $(call BuildPackage,luci-app-admask))

# call BuildPackage - OpenWrt buildroot signature