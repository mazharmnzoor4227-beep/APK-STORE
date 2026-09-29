#!/usr/bin/env bash
set -euo pipefail

REPO="$GITHUB_REPOSITORY"
PACKAGE="com.apkstore.client"
OLD_RUN="36629925463"
OLD_DIR="$RUNNER_TEMP/old-release"
mkdir -p "$OLD_DIR"

echo "== Download verified v1.1.7 signed artifact =="
gh run download "$OLD_RUN" --repo "$REPO" --name APK-STORE-signed-release --dir "$OLD_DIR"
test -f "$OLD_DIR/APK-STORE-signed.apk"

echo "== Install v1.1.7 baseline =="
adb install -r "$OLD_DIR/APK-STORE-signed.apk"
adb shell appops set "$PACKAGE" REQUEST_INSTALL_PACKAGES allow || true

version_code() {
  adb shell dumpsys package "$PACKAGE" | sed -n 's/.*versionCode=\([0-9]*\).*/\1/p' | head -1 | tr -d '\r'
}

if [ "$(version_code)" != "15" ]; then
  echo "Expected installed baseline versionCode 15, got $(version_code)"
  exit 1
fi

echo "== Launch v1.1.7 explicitly and verify process =="
adb logcat -c || true
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
sleep 10
PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
if [ -z "$PID" ]; then
  echo "v1.1.7 did not stay running"
  adb logcat -d -t 250 AndroidRuntime:E ActivityManager:E '*:S' || true
  exit 1
fi

ui_dump() {
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb shell cat /sdcard/window.xml 2>/dev/null | tr -d '\r'
}

tap_node() {
  local needle="$1"
  local timeout="${2:-25}"
  python3 - "$needle" "$timeout" <<'PY'
import re, subprocess, sys, time, xml.etree.ElementTree as ET
needle=sys.argv[1]; timeout=int(sys.argv[2])
end=time.time()+timeout
last=''
while time.time()<end:
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/window.xml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    xml=subprocess.run(['adb','shell','cat','/sdcard/window.xml'],capture_output=True,text=True,timeout=15).stdout
    last=xml
    try:
        root=ET.fromstring(xml)
    except Exception:
        time.sleep(.5); continue
    for n in root.iter('node'):
        text=n.attrib.get('text','')
        desc=n.attrib.get('content-desc','')
        if text==needle or desc==needle:
            m=re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.attrib.get('bounds',''))
            if not m: continue
            x1,y1,x2,y2=map(int,m.groups())
            subprocess.check_call(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)])
            print('Tapped:', needle)
            raise SystemExit(0)
    time.sleep(.5)
print('Could not find node:', needle)
print(last[-12000:])
raise SystemExit(1)
PY
}

wait_for_any_and_tap() {
  local timeout="${1:-90}"; shift
  python3 - "$timeout" "$@" <<'PY'
import re, subprocess, sys, time, xml.etree.ElementTree as ET
timeout=int(sys.argv[1]); needles=sys.argv[2:]
end=time.time()+timeout
last=''
while time.time()<end:
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/window.xml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    xml=subprocess.run(['adb','shell','cat','/sdcard/window.xml'],capture_output=True,text=True,timeout=15).stdout
    last=xml
    try: root=ET.fromstring(xml)
    except Exception:
        time.sleep(.5); continue
    for target in needles:
        for n in root.iter('node'):
            text=n.attrib.get('text','')
            desc=n.attrib.get('content-desc','')
            if text==target or desc==target:
                m=re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.attrib.get('bounds',''))
                if not m: continue
                x1,y1,x2,y2=map(int,m.groups())
                subprocess.check_call(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)])
                print('Tapped system action:',target)
                raise SystemExit(0)
    time.sleep(.5)
print('No installer action found:', needles)
print(last[-12000:])
raise SystemExit(1)
PY
}

echo "== Wait for clean-install catalog to load current v1.1.8 metadata =="
sleep 12

echo "== Navigate About -> Check for update =="
tap_node "Settings" 30
sleep 1
tap_node "About" 30
sleep 1
tap_node "Check for update" 30
sleep 1

echo "== Confirm v1.1.8 is offered by legacy app and start it =="
tap_node "Update now" 45

echo "== Wait for Android installer confirmation and accept update =="
wait_for_any_and_tap 120 "Update" "Install"

sleep 2
if [ "$(version_code)" != "16" ]; then
  python3 - <<'PY'
import re, subprocess, time, xml.etree.ElementTree as ET
for _ in range(30):
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/window.xml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    xml=subprocess.run(['adb','shell','cat','/sdcard/window.xml'],capture_output=True,text=True).stdout
    try: root=ET.fromstring(xml)
    except Exception:
        time.sleep(1); continue
    clicked=False
    for target in ('Update','Install','Done','Open'):
        for n in root.iter('node'):
            if n.attrib.get('text','')==target:
                m=re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.attrib.get('bounds',''))
                if m:
                    x1,y1,x2,y2=map(int,m.groups())
                    subprocess.run(['adb','shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)])
                    print('Tapped follow-up:',target)
                    clicked=True
                    break
        if clicked: break
    time.sleep(1)
PY
fi

echo "== Verify installed version becomes 16 =="
for i in $(seq 1 90); do
  VC="$(version_code)"
  if [ "$VC" = "16" ]; then
    echo "Installed versionCode is 16"
    break
  fi
  sleep 1
  if [ "$i" = "90" ]; then
    echo "Self-update did not reach versionCode 16; current=$VC"
    ui_dump | tail -c 12000 || true
    adb logcat -d -t 300 | grep -E 'APK STORE|apkstore|PackageInstaller|AndroidRuntime' || true
    exit 1
  fi
done

echo "== Relaunch upgraded app and verify it stays alive =="
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
sleep 4
PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
test -n "$PID"
test "$(version_code)" = "16"

echo "SELF_UPDATE_E2E_V117_TO_V118_OK"
