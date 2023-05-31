#!/bin/sh

cnf_dir='/mnt/openssl/'
certs_dir='/etc/ssl/certs/'
openssl req -config ${cnf_dir}pairdropCA.cnf -new -x509 -days 1 -keyout ${certs_dir}pairdropCA.key -out ${certs_dir}pairdropCA.crt
openssl req -config ${cnf_dir}pairdropCert.cnf -new -out /tmp/pairdrop-dev.csr -keyout ${certs_dir}pairdrop-dev.key
openssl x509 -req -in /tmp/pairdrop-dev.csr -CA ${certs_dir}pairdropCA.crt -CAkey ${certs_dir}pairdropCA.key -CAcreateserial -extensions req_ext -extfile ${cnf_dir}pairdropCert.cnf -sha512 -days 1 -out ${certs_dir}pairdrop-dev.crt

exec "$@"
