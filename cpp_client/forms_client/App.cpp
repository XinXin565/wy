#using <System.dll>
#using <System.Drawing.dll>
#using <System.Windows.Forms.dll>
#define wWinMain legacy_wWinMain
#include "../license_test.cpp"
#undef wWinMain
#include <msclr/marshal_cppstd.h>
using namespace System;
static std::string wide_to_utf8(String^ value){return wide_to_utf8(msclr::interop::marshal_as<std::wstring>(value));}
using namespace System; using namespace System::Drawing; using namespace System::Windows::Forms;

// v3 示例客户端：PRODUCT_CODE/CLIENT_VERSION 在 license_test.cpp 中集中配置。
public ref class HeartbeatForm:public Form{Label^ state;public:HeartbeatForm(){Text=L"\u5fc3\u8df3\u9a8c\u8bc1\u8be6\u60c5";Width=480;Height=300;state=gcnew Label();state->Dock=DockStyle::Fill;state->Padding=System::Windows::Forms::Padding(24);state->Text=L"\u72b6\u6001\uff1a\u8fd0\u884c\u4e2d\n\u5fc3\u8df3\u95f4\u9694\uff1a5\u79d2\n\u4f20\u8f93\u534f\u8bae\uff1av3 LK3/LR3";Controls->Add(state);}};

public ref class MainForm:public Form{
    TextBox^ key; Label^ notice; Label^ version; Button^ login; HeartbeatForm^ heartbeat;
public:
    MainForm(){Text=L"\u5361\u5bc6\u9a8c\u8bc1 SDK v3";Width=560;Height=430;StartPosition=FormStartPosition::CenterScreen;BackColor=Color::FromArgb(247,249,252);
        auto title=gcnew Label();title->Text=L"\u4ea7\u54c1\u6388\u6743";title->Font=gcnew System::Drawing::Font(L"Segoe UI",20,FontStyle::Bold);title->Location=Point(36,28);title->AutoSize=true;Controls->Add(title);
        version=gcnew Label();version->Text=L"\u6700\u65b0\u7248\u672c\uff1a\u8bfb\u53d6\u4e2d    \u672c\u5730\u7248\u672c\uff1a3.0.0";version->Location=Point(40,72);version->AutoSize=true;Controls->Add(version);
        notice=gcnew Label();notice->Text=L"\u6b63\u5728\u8fde\u63a5\u670d\u52a1\u5668\u8bfb\u53d6\u4ea7\u54c1\u914d\u7f6e...";notice->Location=Point(40,110);notice->Size=Drawing::Size(465,70);notice->BorderStyle=BorderStyle::FixedSingle;notice->Padding=System::Windows::Forms::Padding(12);Controls->Add(notice);
        auto label=gcnew Label();label->Text=L"\u5361\u5bc6";label->Location=Point(40,205);label->AutoSize=true;Controls->Add(label);key=gcnew TextBox();key->Location=Point(40,230);key->Width=465;Controls->Add(key);
        login=gcnew Button();login->Text=L"\u767b\u5f55\u9a8c\u8bc1";login->Location=Point(40,280);login->Width=465;login->Height=42;login->BackColor=Color::FromArgb(35,99,235);login->ForeColor=Color::White;login->Click+=gcnew EventHandler(this,&MainForm::Login);Controls->Add(login);
        auto footer=gcnew Label();footer->Text=L"v3 \u52a0\u5bc6\u4f20\u8f93 | \u5fc3\u8df3\u95f4\u9694 5 \u79d2";footer->Location=Point(40,350);footer->AutoSize=true;Controls->Add(footer); Load+=gcnew EventHandler(this,&MainForm::Bootstrap);
    }
private:
    // 启动握手：产品不存在或服务端异常时，明确显示错误并禁止登录。
    void Bootstrap(Object^,EventArgs^){try{Response r=secure_bootstrap();if(r.status!=200){notice->Text=L"\u4ea7\u54c1\u63e1\u624b\u5931\u8d25\uff1a"+ToManaged(r.body);login->Enabled=false;return;}auto a=json_value(r.body,"content"),v=json_value(r.body,"version");notice->Text=a.empty()?L"\u5f53\u524d\u6ca1\u6709\u516c\u544a":ToManaged(a);version->Text=L"\u6700\u65b0\u7248\u672c\uff1a"+ToManaged(v)+L"    \u672c\u5730\u7248\u672c\uff1a3.0.0";}catch(...){notice->Text=L"\u4ea7\u54c1\u914d\u7f6e\u8bfb\u53d6\u5931\u8d25\uff1a\u65e0\u6cd5\u8fde\u63a5\u670d\u52a1\u5668";login->Enabled=false;}}
    static String^ ToManaged(const std::string& s){std::wstring w;for(size_t i=0;i<s.size();){if(i+5<s.size()&&s[i]=='\\'&&s[i+1]=='u'){unsigned v=0;for(int j=0;j<4;j++){char c=s[i+2+j];v=v*16+(c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c-'A'+10);}w.push_back((wchar_t)v);i+=6;}else{size_t n=1;while(i+n<s.size()&&s[i+n]!='\\')n++;w+=utf8_to_wide(s.substr(i,n));i+=n;}}return gcnew String(w.c_str());}
    // 登录：使用 v3 activate，成功后显示服务器返回的到期时间。
    void Login(Object^,EventArgs^){if(String::IsNullOrWhiteSpace(key->Text)){MessageBox::Show(L"\u8bf7\u8f93\u5165\u5361\u5bc6",L"\u63d0\u793a");return;}try{Response r=secure_post("activate",wide_to_utf8(key->Text));if(r.status!=200){MessageBox::Show(ToManaged(r.body),L"\u767b\u5f55\u5931\u8d25");return;}auto exp=json_value(r.body,"expires_at");MessageBox::Show(L"\u767b\u5f55\u6210\u529f\n\u5230\u671f\u65f6\u95f4\uff1a"+(exp.empty()?L"\u6c38\u4e45":ToManaged(exp)),L"\u767b\u5f55\u6210\u529f",MessageBoxButtons::OK,MessageBoxIcon::Information);heartbeat=gcnew HeartbeatForm();heartbeat->Show(this);}catch(Exception^ ex){MessageBox::Show(ex->Message,L"\u7f51\u7edc\u9519\u8bef");}}
};
[STAThread]int main(array<String^>^){Application::EnableVisualStyles();Application::SetCompatibleTextRenderingDefault(false);Application::Run(gcnew MainForm());return 0;}
