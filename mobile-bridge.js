import { Capacitor, registerPlugin } from './vendor/capacitor-core.js';

window.MathVisionNative = Capacitor;
window.MathVisionScanner = registerPlugin('DocumentScanner');
