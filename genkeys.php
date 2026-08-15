<?php
$k=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);
openssl_pkey_export($k,$private); $public=openssl_pkey_get_details($k)['key'];
file_put_contents(__DIR__.'/rsa_private.pem',$private); file_put_contents(__DIR__.'/rsa_public.pem',$public);
echo "generated\n";
