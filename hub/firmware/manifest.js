/* 자동 생성(tools/build_firmware.mjs). file:// 에서도 읽히도록 manifest.json 과 같은 내용을 script 로 둔다. */
window.HUB_FIRMWARE_MANIFEST = {
  "schema": 1,
  "note": "자동 생성(tools/build_firmware.mjs). 로봇별 기본 펌웨어 정보.",
  "robots": {
    "smars": {
      "name": "SMARS",
      "board": "Arduino Uno 호환 (ATmega328P)",
      "boardNote": "",
      "fqbn": "arduino:avr:uno",
      "method": "avr",
      "bauds": [
        115200,
        57600
      ],
      "signature": "1e950f",
      "buildKey": "20c7258b927ce047",
      "status": "ok",
      "source": {
        "repo": "smars_web",
        "url": "https://github.com/kgh-DaC/lecture-SMARS.git",
        "path": "twin/smars_firmware",
        "commit": "11d011fbf1ebe318518ee15789d313f12abdf745",
        "commitDate": "2026-11-22T22:39:50+09:00",
        "head": "3ac28705529646fa2479f386a87217ab8075974a",
        "dirty": false
      },
      "built": "2026-11-26T12:20:20.725Z",
      "toolchain": {
        "arduinoCli": "1.5.1",
        "core": "arduino:avr@1.8.8",
        "libraries": []
      },
      "size": {
        "flash": 10930,
        "flashMax": 32256,
        "ram": 614,
        "ramMax": 2048
      },
      "files": [
        {
          "name": "firmware.hex",
          "kind": "hex",
          "address": 0,
          "size": 10930,
          "sha256": "844e7a76bab3630207c93584e4bf94e23a854ac52b27885c681c4f7d0f0f852a"
        }
      ],
      "data": "hub/firmware/smars/firmware.data.js"
    },
    "ottobot": {
      "name": "오토봇",
      "board": "Arduino Nano 호환 (ATmega328P, Optiboot)",
      "boardNote": "",
      "fqbn": "arduino:avr:uno",
      "method": "avr",
      "bauds": [
        115200,
        57600
      ],
      "signature": "1e950f",
      "buildKey": "57de2ddf12fb2711",
      "status": "ok",
      "source": {
        "repo": "ottobot",
        "url": "https://github.com/kgh-DaC/ottobot.git",
        "path": "firmware/otto_fat",
        "commit": "ece9b4a15a797f76bd600fa5e1dab6e011554e23",
        "commitDate": "2026-11-26T16:24:59+09:00",
        "head": "ece9b4a15a797f76bd600fa5e1dab6e011554e23",
        "dirty": false
      },
      "built": "2026-11-26T12:20:27.926Z",
      "toolchain": {
        "arduinoCli": "1.5.1",
        "core": "arduino:avr@1.8.8",
        "libraries": [
          "OttoDIYLib@13.0.0",
          "Servo@1.3.0"
        ]
      },
      "size": {
        "flash": 30558,
        "flashMax": 32256,
        "ram": 1290,
        "ramMax": 2048,
        "flashLimit": 30720
      },
      "files": [
        {
          "name": "firmware.hex",
          "kind": "hex",
          "address": 0,
          "size": 30558,
          "sha256": "29002497ae5201e7aecae8445d2ceb293b987403ed9d86002ac4229e1b1c220f"
        }
      ],
      "data": "hub/firmware/ottobot/firmware.data.js"
    },
    "robotdog": {
      "name": "로봇 개",
      "board": "ESP32 개발 보드 (ESP32-WROOM, 4MB)",
      "boardNote": "",
      "fqbn": "esp32:esp32:esp32",
      "method": "esp32",
      "bauds": [
        460800,
        115200
      ],
      "signature": "",
      "buildKey": "bdf8100c4e24774a",
      "status": "ok",
      "source": {
        "repo": "robot_dog",
        "url": "https://github.com/kgh-DaC/robot-dog.git",
        "path": "esp32-robot-dog-code-master/tools/servoInitPose",
        "commit": "fc0672de74a6d9aa302343c695d4faec399de693",
        "commitDate": "2026-11-22T03:15:39+09:00",
        "head": "fc0672de74a6d9aa302343c695d4faec399de693",
        "dirty": false
      },
      "built": "2026-11-26T12:35:14.348Z",
      "toolchain": {
        "arduinoCli": "1.5.1",
        "core": "esp32:esp32@3.3.12",
        "libraries": []
      },
      "size": {
        "flash": 1142623,
        "flashMax": 1310720,
        "ram": 52124,
        "ramMax": 327680
      },
      "flash": {
        "mode": "dio",
        "freq": "80m",
        "size": "4MB"
      },
      "files": [
        {
          "name": "bootloader.bin",
          "kind": "bin",
          "address": 4096,
          "size": 24992,
          "sha256": "47bbbfca119fe87190f63a67af9d85adff6433bcf3812ec92a9b9c9416a53ad1"
        },
        {
          "name": "partitions.bin",
          "kind": "bin",
          "address": 32768,
          "size": 3072,
          "sha256": "148b959cbff1c38aa8e1d5c0ba9d612c54997b945e56a63f41223eef650653a1"
        },
        {
          "name": "boot_app0.bin",
          "kind": "bin",
          "address": 57344,
          "size": 8192,
          "sha256": "f94c5d786a7a8fab06ac5d10e33bf37711a6697636dc037559ea19cc410a17f0"
        },
        {
          "name": "app.bin",
          "kind": "bin",
          "address": 65536,
          "size": 1142768,
          "sha256": "363cfa28d4b97631de0434c478e45b4f5a6b5478c2355e295cb87e97074771b1"
        }
      ],
      "data": "hub/firmware/robotdog/firmware.data.js"
    },
    "bike": {
      "name": "셀프 밸런싱 바이크",
      "board": "Arduino Nano 호환 (ATmega328P)",
      "boardNote": "보드 종류를 아직 확인하지 못했습니다(Nano 가정).",
      "fqbn": "arduino:avr:nano",
      "method": "avr",
      "bauds": [
        115200,
        57600
      ],
      "signature": "1e950f",
      "buildKey": "38c6c9364082b818",
      "status": "ok",
      "source": {
        "repo": "self-balancing-bike_app",
        "url": "https://github.com/kgh-DaC/self-balancing-bike_app.git",
        "path": "03.Firmware/self_balancing_bike",
        "commit": "b4c4be941189e176476c5b4aeae6b4aa7b21bc4c",
        "commitDate": "2026-11-09T18:00:30+09:00",
        "head": "b57f147ea1bcaddfb1dadc409828ea109377f291",
        "dirty": false
      },
      "built": "2026-11-26T12:28:37.190Z",
      "toolchain": {
        "arduinoCli": "1.5.1",
        "core": "arduino:avr@1.8.8",
        "libraries": [
          "ServoTimer2-master@"
        ]
      },
      "size": {
        "flash": 10762,
        "flashMax": 30720,
        "ram": 677,
        "ramMax": 2048
      },
      "files": [
        {
          "name": "firmware.hex",
          "kind": "hex",
          "address": 0,
          "size": 10762,
          "sha256": "7bb0b22944f0787f04e1ace601a82acc987672f7cf8c32bf0d2ef50e10ae334f"
        }
      ],
      "data": "hub/firmware/bike/firmware.data.js"
    }
  }
};
