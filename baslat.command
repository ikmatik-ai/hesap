#!/bin/bash
# Hesap Takip Sistemi - Mac Başlatıcı

cd "$(dirname "$0")"

echo "======================================================"
echo "         HESAP TAKİP SİSTEMİ - MAC BAŞLATICI"
echo "======================================================"
echo ""

if ! command -v node &> /dev/null
then
    echo "[HATA] Node.js bulunamadı!"
    echo "Lütfen https://nodejs.org/ adresinden Node.js indirip kurun."
    echo ""
    read -p "Çıkmak için Enter'a basın..."
    exit 1
fi

echo "[1/2] Gerekli bileşenler kontrol ediliyor..."
npm install

echo "[2/2] Uygulama başlatılıyor..."
npm start
