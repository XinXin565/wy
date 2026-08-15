# C++/CLI Windows Forms 客户端设计

## 目标

面向接入方的 C++ SDK 示例客户端，使用普通 Windows Forms 窗体，不依赖 Qt 或 WinUI 3，通信协议保持 v3。

## 界面

- 主窗体：产品名称、公告、最新版本、本地版本、卡密输入框、登录按钮、状态提示。
- 登录成功：消息框显示“登录成功”和到期时间。
- 心跳窗体：在线状态、最近心跳时间、服务器时间、设备唯一码、产品编号、会话状态。

## 模块

```text
forms_client/
  App.cpp
  MainForm.h/.cpp
  HeartbeatForm.h/.cpp
  sdk/V3Transport.h/.cpp
  sdk/ProductBootstrap.h/.cpp
  sdk/LicenseSession.h/.cpp
  sdk/HeartbeatService.h/.cpp
  models/ProductConfig.h
  models/LicenseSessionInfo.h
```

## 生命周期

1. 主窗体加载时调用 `/api/v3/products/bootstrap`。
2. 读取公告、当前版本、最低版本和 crypto profile。
3. 产品校验失败时禁止登录。
4. 登录按钮调用 v3 activate。
5. 成功后显示到期时间并打开心跳窗体。
6. `HeartbeatService` 使用独立线程每 5 秒调用 heartbeat。
7. 封禁、到期、撤销或心跳失败时更新 UI 并结束会话。
8. 窗体关闭时调用 logout。

## 构建

使用 MSVC C++/CLI：

```text
/clr /std:c++17 /EHsc
```

依赖 `System.dll`、`System.Windows.Forms.dll` 和现有 v3 加密实现。
