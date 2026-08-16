#using <System.dll>
#using <System.Drawing.dll>
#using <System.Windows.Forms.dll>
#define wWinMain legacy_wWinMain
#include "../license_test.cpp"
#undef wWinMain
#include "sdk/LicenseSession.h"
#include <msclr/marshal_cppstd.h>

using namespace System;
using namespace System::Drawing;
using namespace System::Drawing::Drawing2D;
using namespace System::Threading;
using namespace System::Windows::Forms;

static LicenseSdk::LicenseSession session;

public ref class GlassPanel : public Panel {
public:
    GlassPanel() { DoubleBuffered = true; BackColor = Color::Transparent; }
protected:
    virtual void OnPaintBackground(PaintEventArgs^ e) override {
        e->Graphics->SmoothingMode = SmoothingMode::AntiAlias;
        System::Drawing::Rectangle rect = ClientRectangle; rect.Inflate(-1, -1);
        GraphicsPath^ path = gcnew GraphicsPath();
        int r = 18;
        path->AddArc((float)rect.Left, (float)rect.Top, (float)r, (float)r, 180.0f, 90.0f); path->AddArc((float)(rect.Right-r), (float)rect.Top, (float)r, (float)r, 270.0f, 90.0f);
        path->AddArc((float)(rect.Right-r), (float)(rect.Bottom-r), (float)r, (float)r, 0.0f, 90.0f); path->AddArc((float)rect.Left, (float)(rect.Bottom-r), (float)r, (float)r, 90.0f, 90.0f); path->CloseFigure();
        LinearGradientBrush^ fill = gcnew LinearGradientBrush(rect, Color::FromArgb(224,255,255,255), Color::FromArgb(184,224,242,245), 130.0f);
        e->Graphics->FillPath(fill, path);
        e->Graphics->DrawPath(gcnew Pen(Color::FromArgb(210,255,255,255), 1.0f), path);
    }
};

static std::string to_utf8(String^ value) {
    return wide_to_utf8(msclr::interop::marshal_as<std::wstring>(value));
}

static String^ to_managed(const std::string& value) {
    return gcnew String(utf8_to_wide(value).c_str());
}

static String^ error_message(const std::string& body) {
    if (body.find("license_suspended") != std::string::npos) return L"卡密已被封禁";
    if (body.find("license_expired") != std::string::npos) return L"卡密已到期";
    if (body.find("license_revoked") != std::string::npos) return L"卡密已被撤销";
    if (body.find("device_not_bound") != std::string::npos) return L"当前设备绑定已失效";
    if (body.find("device_limit_reached") != std::string::npos) return L"设备数量已达上限";
    if (body.find("product_name_mismatch") != std::string::npos) return L"客户端产品名称不匹配";
    if (body.find("invalid_license") != std::string::npos) return L"卡密错误";
    if (body.find("script_not_enabled") != std::string::npos) return L"云函数尚未启用";
    if (body.find("script_execution_failed") != std::string::npos) return L"云函数执行失败";
    if (body.find("product_not_found") != std::string::npos) return L"产品不存在或已停用";
    if (body.find("network") != std::string::npos || body.find("connect") != std::string::npos) return L"网络连接失败";
    return L"验证失败，请稍后重试";
}

// v3 云函数传输：卡密、设备和产品信息均位于 LK3 加密载荷中。
static Response secure_execute(const LicenseSdk::LicenseSessionData& auth,
                               const std::string& function,
                               const std::string& args) {
    const std::string path = "/api/v3/products/execute";
    auto key = random_bytes(32), iv = random_bytes(12), nonce = random_bytes(24);
    std::string plain = "{\"license_key\":\"" + json_escape(auth.license_key) +
        "\",\"product_code\":\"" + json_escape(auth.product_code) +
        "\",\"product_name\":\"" + json_escape(auth.product_name) +
        "\",\"function\":\"" + json_escape(function) +
        "\",\"args\":" + (args.empty() ? "{}" : args) +
        ",\"device_id\":\"" + json_escape(auth.device_id) +
        "\",\"_path\":\"" + path +
        "\",\"_timestamp\":\"" + std::to_string(std::time(nullptr)) +
        "\",\"_nonce\":\"" + b64url(nonce) + "\"}";
    std::vector<BYTE> tag, bytes(plain.begin(), plain.end());
    auto cipher = aes_gcm(true, key, iv, "", bytes, tag);
    auto wrapped = rsa_oaep(key);
    std::string packet("LK3\0", 4);
    packet.append((char*)wrapped.data(), wrapped.size());
    packet.append((char*)iv.data(), iv.size());
    packet.append((char*)tag.data(), tag.size());
    packet.append((char*)cipher.data(), cipher.size());
    Response response = http_post(path, packet);
    if (response.body.size() < 32 || response.body.compare(0, 4, "LR3\0", 4) != 0) return response;
    std::vector<BYTE> responseIv(response.body.begin() + 4, response.body.begin() + 16);
    std::vector<BYTE> responseTag(response.body.begin() + 16, response.body.begin() + 32);
    std::vector<BYTE> responseCipher(response.body.begin() + 32, response.body.end());
    auto decoded = aes_gcm(false, key, responseIv, "", responseCipher, responseTag);
    response.body.assign(decoded.begin(), decoded.end());
    return response;
}

public ref class HeartbeatForm : public Form {
public:
    HeartbeatForm() {
        Text = L"心跳验证详情";
        Width = 500; Height = 300;
        StartPosition = FormStartPosition::CenterParent;
        auto panel = gcnew GlassPanel(); panel->Location = Point(24, 24); panel->Size = Drawing::Size(452, 190); Controls->Add(panel);
        state = gcnew Label(); state->Location = Point(24, 24); state->Size = Drawing::Size(404, 140); state->Padding = System::Windows::Forms::Padding(20); state->Font = gcnew System::Drawing::Font(L"Microsoft YaHei UI", 11); state->ForeColor = Color::FromArgb(31, 68, 78); state->Text = L"●  状态：在线\r\n\r\n心跳间隔：5 秒\r\n传输协议：v3 LK3/LR3"; panel->Controls->Add(state);
        running = true;
        worker = gcnew Thread(gcnew ThreadStart(this, &HeartbeatForm::HeartbeatLoop));
        worker->IsBackground = true;
        worker->Start();
    }
protected:
    virtual void OnFormClosing(FormClosingEventArgs^ e) override {
        running = false;
        auto auth = session.get();
        if (auth.authenticated) {
            try { secure_post("logout", auth.license_key); } catch (...) {}
        }
        session.clear();
        Form::OnFormClosing(e);
    }
private:
    Label^ state;
    Thread^ worker;
    volatile bool running;

    void HeartbeatLoop() {
        int networkFailures = 0;
        while (running) {
            Thread::Sleep(5000);
            if (!running) break;
            auto auth = session.get();
            if (!auth.authenticated) break;
            try {
                Response response = secure_post("heartbeat", auth.license_key);
                if (response.status == 200) {
                    networkFailures = 0;
                    BeginInvoke(gcnew Action<String^>(this, &HeartbeatForm::ShowOnline),
                        L"状态：在线\r\n最近心跳：" + DateTime::Now.ToString(L"yyyy-MM-dd HH:mm:ss") +
                        L"\r\n到期时间：" + (auth.expires_at.empty() ? L"永久" : to_managed(auth.expires_at)));
                    continue;
                }
                BeginInvoke(gcnew Action<String^>(this, &HeartbeatForm::ForceOffline), error_message(response.body));
                break;
            } catch (...) {
                if (++networkFailures >= 3) {
                    BeginInvoke(gcnew Action<String^>(this, &HeartbeatForm::ForceOffline), L"网络连续异常，授权会话已下线");
                    break;
                }
            }
        }
    }
    void ShowOnline(String^ text) { state->Text = text; }
    void ForceOffline(String^ reason) {
        running = false;
        session.clear();
        state->Text = L"状态：离线\r\n原因：" + reason;
        MessageBox::Show(reason, L"授权已失效", MessageBoxButtons::OK, MessageBoxIcon::Warning);
    }
};

public ref class MainForm : public Form {
public:
    MainForm() {
        Text = L"卡密验证 SDK v3";
        Width = 580; Height = 440;
        StartPosition = FormStartPosition::CenterScreen;
        BackColor = Color::FromArgb(231, 241, 246); FormBorderStyle = System::Windows::Forms::FormBorderStyle::FixedSingle; MaximizeBox = false;
        auto title = gcnew Label(); title->Text = L"产品授权"; title->Font = gcnew System::Drawing::Font(L"Microsoft YaHei UI", 20, FontStyle::Bold); title->ForeColor = Color::FromArgb(20, 66, 78); title->Location = Point(34, 22); title->AutoSize = true; Controls->Add(title);
        auto product = gcnew Label(); product->Text = L"XINGODSKJH  /  授权中心"; product->ForeColor = Color::FromArgb(21, 150, 181); product->Font = gcnew System::Drawing::Font(L"Microsoft YaHei UI", 8, FontStyle::Bold); product->Location = Point(38, 58); product->AutoSize = true; Controls->Add(product);
        version = gcnew Label(); version->Location = Point(38, 82); version->AutoSize = true; version->ForeColor = Color::FromArgb(91, 119, 128); version->Text = L"正在读取版本信息..."; Controls->Add(version);
        auto noticePanel = gcnew GlassPanel(); noticePanel->Location = Point(32, 112); noticePanel->Size = Drawing::Size(500, 78); Controls->Add(noticePanel);
        notice = gcnew Label(); notice->Location = Point(16, 12); notice->Size = Drawing::Size(468, 52); notice->ForeColor = Color::FromArgb(37, 71, 72); notice->Text = L"正在读取产品公告..."; notice->AutoEllipsis = true; noticePanel->Controls->Add(notice);
        auto authPanel = gcnew GlassPanel(); authPanel->Location = Point(32, 210); authPanel->Size = Drawing::Size(500, 126); Controls->Add(authPanel);
        auto keyLabel = gcnew Label(); keyLabel->Text = L"卡密"; keyLabel->Location = Point(18, 14); keyLabel->AutoSize = true; keyLabel->ForeColor = Color::FromArgb(57, 87, 96); authPanel->Controls->Add(keyLabel);
        key = gcnew TextBox(); key->Location = Point(18, 40); key->Width = 464; key->Height = 30; key->Font = gcnew System::Drawing::Font(L"Microsoft YaHei UI", 10); key->BorderStyle = BorderStyle::FixedSingle; key->BackColor = Color::FromArgb(246, 252, 253); authPanel->Controls->Add(key);
        login = gcnew Button(); login->Text = L"登录验证"; login->Location = Point(18, 78); login->Size = Drawing::Size(464, 34); login->BackColor = Color::FromArgb(21, 150, 181); login->FlatStyle = FlatStyle::Flat; login->FlatAppearance->BorderSize = 0; login->ForeColor = Color::White; login->Click += gcnew EventHandler(this, &MainForm::Login); authPanel->Controls->Add(login);
        auto footer = gcnew Label(); footer->Text = L"安全传输 v3  ·  独立心跳 5 秒"; footer->Location = Point(38, 362); footer->ForeColor = Color::FromArgb(105, 130, 138); footer->AutoSize = true; Controls->Add(footer);
        Load += gcnew EventHandler(this, &MainForm::Bootstrap);
    }
private:
    TextBox^ key; Label^ notice; Label^ version; Button^ login; HeartbeatForm^ heartbeat;
    void Bootstrap(Object^, EventArgs^) {
        try {
            Response response = secure_bootstrap();
            if (response.status != 200) { notice->Text = error_message(response.body); login->Enabled = false; return; }
            auto content = json_value(response.body, "content"); auto latest = json_value(response.body, "version");
            notice->Text = content.empty() ? L"当前没有公告" : to_managed(content);
            version->Text = L"最新版本：" + to_managed(latest) + L"    本地版本：" + to_managed(CLIENT_VERSION);
        } catch (...) { notice->Text = L"产品配置读取失败：服务器连接异常"; login->Enabled = false; }
    }
    void Login(Object^, EventArgs^) {
        if (String::IsNullOrWhiteSpace(key->Text)) { MessageBox::Show(L"请输入卡密", L"提示"); return; }
        login->Enabled = false; login->Text = L"正在验证...";
        try {
            std::string license = to_utf8(key->Text->Trim());
            Response response = secure_post("activate", license);
            if (response.status != 200) { MessageBox::Show(error_message(response.body), L"登录失败"); login->Enabled = true; login->Text = L"登录验证"; return; }
            std::string expires = json_value(response.body, "expires_at");
            session.set({license, PRODUCT_CODE, PRODUCT_NAME, device_code(), expires, true});
            Response cloud = secure_execute(session.get(), "get_security_parameters", "{}");
            String^ cloudState = cloud.status == 200 ? L"云配置读取成功" : L"云配置读取失败：" + error_message(cloud.body);
            MessageBox::Show(L"登录成功\r\n到期时间：" + (expires.empty() ? L"永久" : to_managed(expires)) + L"\r\n" + cloudState, L"登录成功", MessageBoxButtons::OK, MessageBoxIcon::Information);
            heartbeat = gcnew HeartbeatForm(); heartbeat->Show(this);
        } catch (Exception^ ex) { MessageBox::Show(L"网络连接失败，请稍后重试", L"网络错误"); }
        login->Enabled = true; login->Text = L"登录验证";
    }
};

[STAThread]
int main(array<String^>^) {
    Application::EnableVisualStyles();
    Application::SetCompatibleTextRenderingDefault(false);
    Application::Run(gcnew MainForm());
    return 0;
}
