#!/bin/bash
# Hesap Takip Sistemi - Mac Paketleyici

cd "$(dirname "$0")"

echo "======================================================"
echo "         HESAP TAKİP SİSTEMİ - MAC PAKETLEYİCİ"
echo "======================================================"
echo ""
echo "Bu işlem, uygulamanızı Mac için taşınabilir bir .dmg"
echo "veya .app dosyasına dönüştürür."
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

echo "[1/2] Gerekli bileşenler indiriliyor..."
npm install

echo "[2/2] Mac (DMG/APP) Paketi oluşturuluyor..."
echo "Lütfen bekleyin, bu işlem bilgisayarınızın hızına göre sürebilir..."
npm run mac

echo ""
echo "======================================================"
echo "[BAŞARILI] Paketleme tamamlandı!"
echo "Oluşturulan uygulama 'dist' klasörünün içindedir."
echo "======================================================"
echo ""
read -p "Çıkmak için Enter'a basın..."
