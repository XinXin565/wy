#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <iostream>
#include <string>
#include <vector>
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

std::string b64(const std::vector<BYTE>& v){DWORD n=0;CryptBinaryToStringA(v.data(),(DWORD)v.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&n);std::vector<char> b(n);CryptBinaryToStringA(v.data(),(DWORD)v.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,b.data(),&n);return std::string(b.data());}
int main(){std::vector<BYTE> key(32),iv(12),plain{'g','c','m','-','p','r','o','b','e'},tag(16),out(9),obj;for(int i=0;i<32;i++)key[i]=(BYTE)i;for(int i=0;i<12;i++)iv[i]=(BYTE)(0x10+i);BCRYPT_ALG_HANDLE alg;BCRYPT_KEY_HANDLE kh;DWORD size,cb,outSize;BCryptOpenAlgorithmProvider(&alg,BCRYPT_AES_ALGORITHM,nullptr,0);BCryptSetProperty(alg,BCRYPT_CHAINING_MODE,(PUCHAR)BCRYPT_CHAIN_MODE_GCM,(ULONG)sizeof(BCRYPT_CHAIN_MODE_GCM),0);BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&size,sizeof(size),&cb,0);obj.resize(size);BCryptGenerateSymmetricKey(alg,&kh,obj.data(),size,key.data(),32,0);BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;BCRYPT_INIT_AUTH_MODE_INFO(info);info.pbNonce=iv.data();info.cbNonce=12;info.pbTag=tag.data();info.cbTag=16;auto st=BCryptEncrypt(kh,plain.data(),(ULONG)plain.size(),&info,nullptr,0,out.data(),(ULONG)out.size(),&outSize,0);std::cout<<st<<"\n"<<b64(key)<<"\n"<<b64(iv)<<"\n"<<b64(out)<<"\n"<<b64(tag)<<"\n";}
