// 허브가 쓰는 것만 window.HubEsptool 로 내보낸다(file:// 에서 ES module 을 못 쓰므로 IIFE 번들).
import { ESPLoader, Transport } from 'esptool-js';
window.HubEsptool = { ESPLoader, Transport, version: __ESPTOOL_VERSION__ };
