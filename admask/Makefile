include $(TOPDIR)/rules.mk

PKG_NAME:=admask
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/admask
  SECTION:=net
  CATEGORY:=Network
  TITLE:=AdMask - Adversary Masking
  DEPENDS:=+ip-full +kmod-nf-tproxy +nftables-json +openssl-util +tar
endef

define Package/admask/description
  A local MITM proxy for network security and privacy protection. Blocks malicious content, ad, trackers, and unwanted traffic.
endef

define Build/Prepare
endef

define Build/Compile
endef

define Package/admask/conffiles
/etc/config/admask
/etc/admask/rules-sources.yaml
/etc/admask/video-cdn-passthrough.yaml
/etc/admask/video-service-rules.yaml
/etc/admask/hls-sites-rules.yaml
endef

define Package/admask/preinst
#!/bin/sh
if [ -f "/etc/init.d/admask" ]; then
	/etc/init.d/admask stop >/dev/null 2>&1
fi
exit 0
endef

define Package/admask/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/sysctl.d
	$(INSTALL_DIR) $(1)/etc/admask/rules.d
	$(INSTALL_DIR) $(1)/usr/lib/resources
	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d

	# 主程序
ifeq ($(ARCH),i386)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-386 $(1)/usr/bin/admask
endif
ifeq ($(ARCH),x86_64)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-amd64 $(1)/usr/bin/admask
endif

ifeq ($(ARCH),aarch64)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-arm64 $(1)/usr/bin/admask
endif
ifeq ($(ARCH),arm)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-armv7 $(1)/usr/bin/admask
endif
ifeq ($(ARCH),mips64el)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-mips64le-softfloat $(1)/usr/bin/admask
endif
ifeq ($(ARCH),mipsel)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-mipsle-softfloat $(1)/usr/bin/admask
endif
ifeq ($(ARCH),mips)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-mips-softfloat $(1)/usr/bin/admask
endif
ifeq ($(ARCH),riscv64)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-riscv64 $(1)/usr/bin/admask
endif
ifeq ($(ARCH),loongarch64)
	$(INSTALL_BIN) ./files/bin/admask-enc-linux-loong64 $(1)/usr/bin/admask
endif

	# 副引擎
ifeq ($(ARCH),i386)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-386 $(1)/usr/bin/adblock-engine
endif
ifeq ($(ARCH),x86_64)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-amd64 $(1)/usr/bin/adblock-engine
endif

ifeq ($(ARCH),aarch64)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-arm64 $(1)/usr/bin/adblock-engine
endif
ifeq ($(ARCH),arm)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-armv7 $(1)/usr/bin/adblock-engine
endif
ifeq ($(ARCH),riscv64)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-riscv64 $(1)/usr/bin/adblock-engine
endif
ifeq ($(ARCH),loongarch64)
	$(INSTALL_BIN) ./files/bin/adblock-engine-linux-loong64 $(1)/usr/bin/adblock-engine
endif

	# 脚本和配置
	$(INSTALL_BIN) ./files/etc/init.d/admask $(1)/etc/init.d/admask
	$(INSTALL_CONF) ./files/etc/config/admask $(1)/etc/config/admask

	if [ -d ./files/etc/sysctl.d ]; then \
		$(CP) ./files/etc/sysctl.d/* $(1)/etc/sysctl.d/ 2>/dev/null || true; \
	fi

	# 预置 YAML 和目录结构
	$(INSTALL_DIR) $(1)/etc/admask
	$(CP) ./files/etc/admask/. $(1)/etc/admask/

	# resources
	$(INSTALL_DIR) $(1)/usr/lib/resources
	$(CP) ./files/usr/lib/resources/. $(1)/usr/lib/resources/
	
	# 升级白名单
	echo "/etc/admask/" > $(1)/lib/upgrade/keep.d/admask

endef

define Package/admask/postrm
#!/bin/sh

# 载就彻底干掉残留
if [ "$${1}" = "remove" ] || [ "$${1}" = "purge" ]; then
	# 1. 停止并强行删除 init.d 脚本及自启软链接
	if [ -f "/etc/init.d/admask" ]; then
		/etc/init.d/admask stop >/dev/null 2>&1
		/etc/init.d/admask disable >/dev/null 2>&1
		rm -f /etc/init.d/admask
	fi
	rm -rf /etc/rc.d/*admask*
	
	# 2. 清理系统和临时残留
	rm -f /etc/sysctl.d/*admask*.conf
	rm -f /etc/uci-defaults/*admask*
	rm -f /tmp/admask*
	rm -f /var/log/admask*
	rm -f /var/run/admask*.pid
	rm -f /www/ca.crt
fi

exit 0
endef

$(eval $(call BuildPackage,admask))