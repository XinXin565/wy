# C++ 对接测试客户端

依赖 Windows SDK。编译：

```powershell
cl /std:c++17 /EHsc /DUNICODE /D_UNICODE license_test.cpp /link winhttp.lib user32.lib
```

运行 `license_test.exe` 后，会弹出窗口。输入管理后台生成的卡密并点击“登录验证”。

```powershell
程序会调用激活接口，并显示“登录成功”和授权到期时间；失败时显示卡密错误、卡密到期/冻结/撤销或设备数量已满。
