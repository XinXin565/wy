#pragma once
#using <System.dll>
#using <System.Windows.Forms.dll>
using namespace System::Windows::Forms;
public ref class HeartbeatForm : Form { public: HeartbeatForm(){Text=L"心跳验证详情";Width=480;Height=300; Controls->Add(gcnew Label());} };
