@echo off
TITLE Hesap Takip Sistemi - Yönetim Paneli
SETLOCAL EnableDelayedExpansion
CHCP 65001 > nul

cd /d "%~dp0"

:MENU
cls
echo ======================================================
echo          HESAP TAKİP SİSTEMİ - MASAÜSTÜ
echo ======================================================
echo.
echo  [1] Uygulamayı Çalıştır (Desktop Modu)
echo  [2] Standart EXE Paketi Oluştur (Tavsiye Edilir)
echo  [3] Bileşenleri El İle Güncelle (npm install)
echo  [4] Çıkış
echo.
echo ======================================================
echo [NOT] "Hata: SYMLINK" alırsanız lütfen bu dosyayı
echo       YETKİLİ (Administrator) olarak başlatın.
echo ======================================================
set /p secim="Seçiminizi yapın (1-4): "

if "%secim%"=="1" goto START_APP
if "%secim%"=="2" goto BUILD_EXE
if "%secim%"=="3" goto INSTALL
if "%secim%"=="4" exit
goto MENU

:CHECK_NODE
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Node.js bulunamadı!
    echo EXE oluşturmak için Node.js gereklidir.
    echo Lütfen https://nodejs.org/ adresinden kurun.
    echo.
    pause
    exit /b 1
)
exit /b 0

:START_APP
call :CHECK_NODE
if %errorlevel% neq 0 goto MENU

echo.
echo [BİLGİ] Uygulama başlatılıyor...
if not exist node_modules (
    echo [BİLGİ] Bileşenler yükleniyor...
    call npm install
)
start /b "" npx electron .
goto MENU

:BUILD_EXE
call :CHECK_NODE
if %errorlevel% neq 0 goto MENU

echo.
echo [1/2] Hazırlık Yapılıyor...
call npm install
if %errorlevel% neq 0 (
    echo [HATA] İnternet hatası olustu.
    pause
    goto MENU
)

echo.
echo [2/2] EXE Paketi oluşturuluyor...
echo Bu işlem bir süre sürebilir...
echo.
call npx electron-builder --win portable
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Paketleme sırasında bir sorun oluştu!
    echo Lütfen bu dosyayı "Sağ Tık -> Yönetici Olarak Çalıştır" ile deneyiniz.
    pause
) else (
    echo.
    echo [BAŞARILI] EXE dosyanız 'dist' klasörüne kaydedildi!
    echo 'dist\Hesap Takip Sistemi Setup 1.0.0.exe' dosyasını her yere taşıyabilirsiniz.
    pause
)
goto MENU

:INSTALL
call :CHECK_NODE
if %errorlevel% neq 0 goto MENU
call npm install
pause
goto MENU
