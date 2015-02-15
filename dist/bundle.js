(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rAF = _interopRequire(require("./rAF"));

var Wavepad = _interopRequire(require("./wavepad"));

window.addEventListener("DOMContentLoaded", function () {
    var app = new Wavepad({
        waveform: "square",
        filter: "lowpass"
    });

    app.init();
});

},{"./rAF":2,"./wavepad":3}],2:[function(require,module,exports){
"use strict";

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik Möller
// fixes from Paul Irish and Tino Zijdel

var rAF = (function () {
    var lastTime = 0;
    var vendors = ["ms", "moz", "webkit", "o"];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
        window.cancelAnimationFrame = window[vendors[x] + "CancelAnimationFrame"] || window[vendors[x] + "CancelRequestAnimationFrame"];
    }

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
                callback(currTime + timeToCall);
            }, timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
    }
})();

module.exports = rAF;

},{}],3:[function(require,module,exports){
"use strict";

var _prototypeProperties = function (child, staticProps, instanceProps) { if (staticProps) Object.defineProperties(child, staticProps); if (instanceProps) Object.defineProperties(child.prototype, instanceProps); };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Wavepad = (function () {
    function Wavepad(options) {
        _classCallCheck(this, Wavepad);

        // default options
        this.options = {
            waveform: "sine",
            filter: "lowpass"
        };

        // set configurable options
        if (typeof options === "object") {
            for (var i in options) {
                if (options.hasOwnProperty(i)) {
                    this.options[i] = options[i];
                }
            }
        }

        // UI DOM references
        this.main = document.querySelector(".main");
        this.surface = document.querySelector(".surface");
        this.finger = document.querySelector(".finger");
        this.waveform = document.getElementById("waveform");
        this.filter = document.getElementById("filter-type");
        this.powerToggle = document.getElementById("power");
        this.delayTimeInput = document.getElementById("delay");
        this.feedbackGainInput = document.getElementById("feedback");
        this.delayTimeOutput = document.getElementById("delay-output");
        this.feedbackGainOutput = document.getElementById("feedback-output");

        // Canvas graph for audio frequency analyzer
        this.canvas = document.querySelector("canvas");
        this.ctx = this.canvas.getContext("2d");

        // Web Audio Node references
        this.source = null;
        this.nodes = {};
        this.myAudioContext = null;
        this.myAudioAnalyser = null;

        // Map for legacy Web Audio filter values
        this.filters = new Map();
        this.filters.set("lowpass", 0);
        this.filters.set("highpass", 1);
        this.filters.set("bandpass", 2);
        this.filters.set("lowshelf", 3);
        this.filters.set("highshelf", 4);
        this.filters.set("peaking", 5);
        this.filters.set("notch", 6);
        this.filters.set("allpass", 7);

        // Map for legacy Web Audio waveform values
        this.waves = new Map();
        this.waves.set("sine", 0);
        this.waves.set("square", 1);
        this.waves.set("sawtooth", 2);
        this.waves.set("triangle", 3);

        this.hasTouch = false;
        this.isSmallViewport = false;
        this.isPlaying = false;

        // Safari needs some special attention for its non-standards
        this.isSafari = navigator.userAgent.indexOf("Safari") !== -1 && navigator.userAgent.indexOf("Chrome") == -1;
    }

    _prototypeProperties(Wavepad, null, {
        init: {
            value: function init() {
                // normalize and create a new AudioContext if supported
                window.AudioContext = window.AudioContext || window.webkitAudioContext;

                if ("AudioContext" in window) {
                    this.myAudioContext = new AudioContext();
                } else {
                    alert("Your browser does not yet support the Web Audio API");
                    return;
                }

                // bind resize handler for canvas & touch references
                this.handleResize();

                // store references to bound events
                // so we can unbind when needed
                this.playHandler = this.play.bind(this);
                this.moveHandler = this.move.bind(this);
                this.stopHandler = this.stop.bind(this);

                // set default values that we're supplied
                this.waveform.value = this.options.waveform;
                this.filter.value = this.options.filter;
                this.updateOutputs();

                // bind UI control events
                this.powerToggle.addEventListener("click", this.togglePower.bind(this));
                this.waveform.addEventListener("change", this.setWaveform.bind(this));
                this.filter.addEventListener("change", this.filterChange.bind(this));
                this.delayTimeInput.addEventListener("input", this.sliderChange.bind(this));
                this.feedbackGainInput.addEventListener("input", this.sliderChange.bind(this));

                // create Web Audio nodes
                this.nodes.oscVolume = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
                this.nodes.filter = this.myAudioContext.createBiquadFilter();
                this.nodes.volume = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
                this.nodes.delay = this.myAudioContext.createDelay ? this.myAudioContext.createDelay() : this.myAudioContext.createDelayNode();
                this.nodes.feedbackGain = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
                this.nodes.compressor = this.myAudioContext.createDynamicsCompressor();

                // create frequency analyser node
                this.myAudioAnalyser = this.myAudioContext.createAnalyser();
                this.myAudioAnalyser.smoothingTimeConstant = 0.85;

                // start fAF for frequency analyser
                this.animateSpectrum();

                // prevent default scrolling when touchmove fires on surface
                this.surface.addEventListener("touchmove", function (e) {
                    e.preventDefault();
                });
            },
            writable: true,
            configurable: true
        },
        handleResize: {
            value: function handleResize() {
                var _this = this;
                // set default canvas size
                this.isSmallViewport = window.matchMedia("(max-width: 512px)").matches ? true : false;
                this.setCanvasSize();

                // listen for resize events
                window.matchMedia("(max-width: 512px)").addListener(function (mql) {
                    if (mql.matches) {
                        _this.isSmallViewport = true;
                    } else {
                        _this.isSmallViewport = false;
                    }
                    _this.setCanvasSize();
                });
            },
            writable: true,
            configurable: true
        },
        routeSounds: {
            value: function routeSounds() {
                this.source = this.myAudioContext.createOscillator();

                this.setWaveform(this.waveform);
                this.filterChange(this.filter);
                this.nodes.feedbackGain.gain.value = this.feedbackGainInput.value;
                this.nodes.delay.delayTime.value = this.delayTimeInput.value;
                this.nodes.volume.gain.value = 0.2;
                this.nodes.oscVolume.gain.value = 0;

                this.source.connect(this.nodes.oscVolume);
                this.nodes.oscVolume.connect(this.nodes.filter);
                this.nodes.filter.connect(this.nodes.compressor);
                this.nodes.filter.connect(this.nodes.delay);
                this.nodes.delay.connect(this.nodes.feedbackGain);
                this.nodes.delay.connect(this.nodes.compressor);
                this.nodes.feedbackGain.connect(this.nodes.delay);
                this.nodes.compressor.connect(this.nodes.volume);
                this.nodes.volume.connect(this.myAudioAnalyser);
                this.myAudioAnalyser.connect(this.myAudioContext.destination);
            },
            writable: true,
            configurable: true
        },
        startOsc: {
            value: function startOsc() {
                if (!this.source.start) {
                    this.source.start = this.source.noteOn;
                }
                this.source.start(0);
                this.isPlaying = true;
            },
            writable: true,
            configurable: true
        },
        stopOsc: {
            value: function stopOsc() {
                if (!this.source.stop) {
                    this.source.stop = this.source.noteOff;
                }
                this.source.stop(0);
                this.isPlaying = false;
            },
            writable: true,
            configurable: true
        },
        bindSurfaceEvents: {
            value: function bindSurfaceEvents() {
                this.surface.addEventListener("mousedown", this.playHandler);
                this.surface.addEventListener("touchstart", this.playHandler);
            },
            writable: true,
            configurable: true
        },
        unbindSurfaceEvents: {
            value: function unbindSurfaceEvents() {
                this.surface.removeEventListener("mousedown", this.playHandler);
                this.surface.removeEventListener("touchstart", this.playHandler);
            },
            writable: true,
            configurable: true
        },
        togglePower: {
            value: function togglePower() {
                if (this.isPlaying) {
                    this.stopOsc();
                    this.myAudioAnalyser.disconnect();
                    this.unbindSurfaceEvents();
                } else {
                    this.routeSounds();
                    this.startOsc();
                    this.bindSurfaceEvents();
                }

                this.main.classList.toggle("off");
            },
            writable: true,
            configurable: true
        },
        play: {
            value: function play(e) {
                var x = e.type === "touchstart" ? e.touches[0].pageX : e.pageX;
                var y = e.type === "touchstart" ? e.touches[0].pageY : e.pageY;
                var multiplier = this.isSmallViewport ? 2 : 1;

                if (e.type === "touchstart") {
                    this.hasTouch = true;
                } else if (e.type === "mousedown" && this.hasTouch) {
                    return;
                }

                if (!this.isPlaying) {
                    this.routeSounds();
                    this.startOsc();
                }

                x = x - this.surface.offsetLeft;
                y = y - this.surface.offsetTop;

                this.nodes.oscVolume.gain.value = 1;
                this.source.frequency.value = x * multiplier;
                this.setFilterFrequency(y);

                this.finger.style.webkitTransform = this.finger.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
                this.finger.classList.add("active");

                this.surface.addEventListener("touchmove", this.moveHandler);
                this.surface.addEventListener("touchend", this.stopHandler);
                this.surface.addEventListener("touchcancel", this.stopHandler);
                this.surface.addEventListener("mousemove", this.moveHandler);
                this.surface.addEventListener("mouseup", this.stopHandler);
            },
            writable: true,
            configurable: true
        },
        move: {
            value: function move(e) {
                var x = e.type === "touchmove" ? e.touches[0].pageX : e.pageX;
                var y = e.type === "touchmove" ? e.touches[0].pageY : e.pageY;

                if (e.type === "mousemove" && this.hasTouch) {
                    return;
                }

                if (this.isPlaying) {
                    var multiplier = this.isSmallViewport ? 2 : 1;
                    x = x - this.surface.offsetLeft;
                    y = y - this.surface.offsetTop;
                    this.source.frequency.value = x * multiplier;
                    this.setFilterFrequency(y);
                }

                this.finger.style.webkitTransform = this.finger.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
            },
            writable: true,
            configurable: true
        },
        stop: {
            value: function stop(e) {
                var x = e.type === "touchend" ? e.changedTouches[0].pageX : e.pageX;
                var y = e.type === "touchend" ? e.changedTouches[0].pageY : e.pageY;

                if (this.isPlaying) {
                    var multiplier = this.isSmallViewport ? 2 : 1;
                    x = x - this.surface.offsetLeft;
                    y = y - this.surface.offsetTop;
                    this.source.frequency.value = x * multiplier;
                    this.setFilterFrequency(y);
                    this.nodes.oscVolume.gain.value = 0;
                }

                this.finger.classList.remove("active");

                this.surface.removeEventListener("mousemove", this.moveHandler);
                this.surface.removeEventListener("mouseup", this.stopHandler);
                this.surface.removeEventListener("touchmove", this.moveHandler);
                this.surface.removeEventListener("touchend", this.stopHandler);
                this.surface.removeEventListener("touchcancel", this.stopHandler);
            },
            writable: true,
            configurable: true
        },
        updateOutputs: {
            value: function updateOutputs() {
                this.delayTimeOutput.value = Math.round(this.delayTimeInput.value * 1000) + " ms";
                this.feedbackGainOutput.value = Math.round(this.feedbackGainInput.value * 10);
            },
            writable: true,
            configurable: true
        },
        setWaveform: {
            value: function setWaveform(option) {
                var value = option.value || option.target.value;
                this.source.type = this.isSafari ? this.waves.get(value) : value;
            },
            writable: true,
            configurable: true
        },
        sliderChange: {
            value: function sliderChange(slider) {
                if (this.isPlaying) {
                    this.stopOsc();
                    if (slider.id === "delay") {
                        this.nodes.delay.delayTime.value = slider.value;
                    } else if (slider.id === "feedback") {
                        this.nodes.feedbackGain.gain.value = slider.value;
                    }
                }
                this.updateOutputs();
            },
            writable: true,
            configurable: true
        },
        setFilterFrequency: {

            /**
             * Set filter frequency based on (y) axis value
             */
            value: function setFilterFrequency(y) {
                // min 40Hz
                var min = 40;
                // max half of the sampling rate
                var max = this.myAudioContext.sampleRate / 2;
                // Logarithm (base 2) to compute how many octaves fall in the range.
                var numberOfOctaves = Math.log(max / min) / Math.LN2;
                // Compute a multiplier from 0 to 1 based on an exponential scale.
                var multiplier = Math.pow(2, numberOfOctaves * (2 / this.surface.clientHeight * (this.surface.clientHeight - y) - 1));
                // Get back to the frequency value between min and max.
                this.nodes.filter.frequency.value = max * multiplier;
            },
            writable: true,
            configurable: true
        },
        filterChange: {
            value: function filterChange(option) {
                var value = option.value || option.target.value;
                this.nodes.filter.type = this.isSafari ? this.filters.get(value) : value;
            },
            writable: true,
            configurable: true
        },
        animateSpectrum: {
            value: function animateSpectrum() {
                // Limit canvas redraw to 40 fps
                setTimeout(this.onTick.bind(this), 1000 / 40);
            },
            writable: true,
            configurable: true
        },
        onTick: {
            value: function onTick() {
                this.drawSpectrum();
                requestAnimationFrame(this.animateSpectrum.bind(this), this.canvas);
            },
            writable: true,
            configurable: true
        },
        setCanvasSize: {
            value: function setCanvasSize() {
                var canvasSize = this.isSmallViewport ? 256 : 512;
                this.canvas.width = this.canvas.height = canvasSize - 10;
            },
            writable: true,
            configurable: true
        },
        drawSpectrum: {

            /**
             * Draw the canvas frequency data graph
             */
            value: function drawSpectrum() {
                var canvasSize = this.isSmallViewport ? 256 : 512;
                var barWidth = this.isSmallViewport ? 10 : 20;
                var barCount = Math.round(canvasSize / barWidth);
                var freqByteData = new Uint8Array(this.myAudioAnalyser.frequencyBinCount);

                this.ctx.clearRect(0, 0, canvasSize, canvasSize);
                this.ctx.fillStyle = "#1d1c25";

                this.myAudioAnalyser.getByteFrequencyData(freqByteData);

                for (var i = 0; i < barCount; i += 1) {
                    var magnitude = freqByteData[i];
                    var multiplier = this.isSmallViewport ? 1 : 2;
                    // some values need adjusting to fit on the canvas
                    this.ctx.fillRect(barWidth * i, canvasSize, barWidth - 1, -magnitude * multiplier);
                }
            },
            writable: true,
            configurable: true
        }
    });

    return Wavepad;
})();

module.exports = Wavepad;

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvYWxleGdpYnNvbi9HaXQvd2F2ZXBhZC9zcmMvYXBwLmpzIiwiL1VzZXJzL2FsZXhnaWJzb24vR2l0L3dhdmVwYWQvc3JjL3JBRi5qcyIsIi9Vc2Vycy9hbGV4Z2lic29uL0dpdC93YXZlcGFkL3NyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQztBQUNsQixrQkFBWSxRQUFRO0FBQ3BCLGdCQUFVLFNBQVM7S0FDdEIsQ0FBQyxDQUFDOztBQUVILE9BQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztDQUNkLENBQUMsQ0FBQzs7Ozs7Ozs7Ozs7QUNMSCxJQUFJLEdBQUcsR0FBRyxDQUFDLFlBQVk7QUFDbkIsUUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQ2pCLFFBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDM0MsU0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDckUsY0FBTSxDQUFDLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUMxRSxjQUFNLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyxzQkFBc0IsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFP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QUUsR0FBRyxFQUFFLENBQUM7QUFDaEQsb0JBQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLFFBQVEsQ0FBQyxDQUFDO0FBQ25ELG9CQUFNLFlBQVksR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUM7O0FBRTVFLG9CQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNqRCxvQkFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDOztBQUUvQixvQkFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQzs7QUFFeEQscUJBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUNsQyx3QkFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLHdCQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBRWhELHdCQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDO2lCQUN0RjthQUNKOzs7Ozs7V0EvVkMsT0FBTzs7O2lCQWtXRSxPQUFPIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCByQUYgZnJvbSAnLi9yQUYnO1xuaW1wb3J0IFdhdmVwYWQgZnJvbSAnLi93YXZlcGFkJztcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG5cbiAgICB2YXIgYXBwID0gbmV3IFdhdmVwYWQoe1xuICAgICAgICAnd2F2ZWZvcm0nOiAnc3F1YXJlJyxcbiAgICAgICAgJ2ZpbHRlcic6ICdsb3dwYXNzJ1xuICAgIH0pO1xuXG4gICAgYXBwLmluaXQoKTtcbn0pO1xuIiwiLy8gaHR0cDovL3BhdWxpcmlzaC5jb20vMjAxMS9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWFuaW1hdGluZy9cbi8vIGh0dHA6Ly9teS5vcGVyYS5jb20vZW1vbGxlci9ibG9nLzIwMTEvMTIvMjAvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1lci1hbmltYXRpbmdcblxuLy8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHBvbHlmaWxsIGJ5IEVyaWsgTcO2bGxlclxuLy8gZml4ZXMgZnJvbSBQYXVsIElyaXNoIGFuZCBUaW5vIFppamRlbFxuXG52YXIgckFGID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbGFzdFRpbWUgPSAwO1xuICAgIHZhciB2ZW5kb3JzID0gWydtcycsICdtb3onLCAnd2Via2l0JywgJ28nXTtcbiAgICBmb3IodmFyIHggPSAwOyB4IDwgdmVuZG9ycy5sZW5ndGggJiYgIXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWU7ICsreCkge1xuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gd2luZG93W3ZlbmRvcnNbeF0rJ1JlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSB3aW5kb3dbdmVuZG9yc1t4XSsnQ2FuY2VsQW5pbWF0aW9uRnJhbWUnXSB8fCB3aW5kb3dbdmVuZG9yc1t4XSsnQ2FuY2VsUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgfVxuXG4gICAgaWYgKCF3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKSB7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbihjYWxsYmFjaywgZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGN1cnJUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICB2YXIgdGltZVRvQ2FsbCA9IE1hdGgubWF4KDAsIDE2IC0gKGN1cnJUaW1lIC0gbGFzdFRpbWUpKTtcbiAgICAgICAgICAgIHZhciBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjdXJyVGltZSArIHRpbWVUb0NhbGwpOyB9LFxuICAgICAgICAgICAgICB0aW1lVG9DYWxsKTtcbiAgICAgICAgICAgIGxhc3RUaW1lID0gY3VyclRpbWUgKyB0aW1lVG9DYWxsO1xuICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlmICghd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKSB7XG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgICAgICB9O1xuICAgIH1cbn0pKCk7XG5cbmV4cG9ydCBkZWZhdWx0IHJBRjtcbiIsImNsYXNzIFdhdmVwYWQge1xuXG4gICAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuXG4gICAgICAgIC8vIGRlZmF1bHQgb3B0aW9uc1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSB7XG4gICAgICAgICAgICB3YXZlZm9ybTogJ3NpbmUnLFxuICAgICAgICAgICAgZmlsdGVyOiAnbG93cGFzcydcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBzZXQgY29uZmlndXJhYmxlIG9wdGlvbnNcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2ldID0gb3B0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVSSBET00gcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLm1haW4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWFpbicpO1xuICAgICAgICB0aGlzLnN1cmZhY2UgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc3VyZmFjZScpO1xuICAgICAgICB0aGlzLmZpbmdlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5maW5nZXInKTtcbiAgICAgICAgdGhpcy53YXZlZm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3YXZlZm9ybScpO1xuICAgICAgICB0aGlzLmZpbHRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItdHlwZScpO1xuICAgICAgICB0aGlzLnBvd2VyVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bvd2VyJyk7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVsYXknKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmZWVkYmFjaycpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZU91dHB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWxheS1vdXRwdXQnKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5PdXRwdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmVlZGJhY2stb3V0cHV0Jyk7XG5cbiAgICAgICAgLy8gQ2FudmFzIGdyYXBoIGZvciBhdWRpbyBmcmVxdWVuY3kgYW5hbHl6ZXJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdjYW52YXMnKTtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXG4gICAgICAgIC8vIFdlYiBBdWRpbyBOb2RlIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuICAgICAgICB0aGlzLm5vZGVzID0ge307XG4gICAgICAgIHRoaXMubXlBdWRpb0NvbnRleHQgPSBudWxsO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlciA9IG51bGw7XG5cbiAgICAgICAgLy8gTWFwIGZvciBsZWdhY3kgV2ViIEF1ZGlvIGZpbHRlciB2YWx1ZXNcbiAgICAgICAgdGhpcy5maWx0ZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdsb3dwYXNzJywgMCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hwYXNzJywgMSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2JhbmRwYXNzJywgMik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2xvd3NoZWxmJywgMyk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hzaGVsZicsIDQpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdwZWFraW5nJywgNSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ25vdGNoJywgNik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2FsbHBhc3MnLCA3KTtcblxuICAgICAgICAvLyBNYXAgZm9yIGxlZ2FjeSBXZWIgQXVkaW8gd2F2ZWZvcm0gdmFsdWVzXG4gICAgICAgIHRoaXMud2F2ZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzaW5lJywgMCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzcXVhcmUnLCAxKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3Nhd3Rvb3RoJywgMik7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCd0cmlhbmdsZScsIDMpO1xuXG4gICAgICAgIHRoaXMuaGFzVG91Y2ggPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcblxuICAgICAgICAvLyBTYWZhcmkgbmVlZHMgc29tZSBzcGVjaWFsIGF0dGVudGlvbiBmb3IgaXRzIG5vbi1zdGFuZGFyZHNcbiAgICAgICAgdGhpcy5pc1NhZmFyaSA9IG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignU2FmYXJpJykgIT09IC0xICYmIG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignQ2hyb21lJykgPT0gLTE7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcblxuICAgICAgICAvLyBub3JtYWxpemUgYW5kIGNyZWF0ZSBhIG5ldyBBdWRpb0NvbnRleHQgaWYgc3VwcG9ydGVkXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG5cbiAgICAgICAgaWYgKCdBdWRpb0NvbnRleHQnIGluIHdpbmRvdykge1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFsZXJ0KCdZb3VyIGJyb3dzZXIgZG9lcyBub3QgeWV0IHN1cHBvcnQgdGhlIFdlYiBBdWRpbyBBUEknKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGJpbmQgcmVzaXplIGhhbmRsZXIgZm9yIGNhbnZhcyAmIHRvdWNoIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5oYW5kbGVSZXNpemUoKTtcblxuICAgICAgICAvLyBzdG9yZSByZWZlcmVuY2VzIHRvIGJvdW5kIGV2ZW50c1xuICAgICAgICAvLyBzbyB3ZSBjYW4gdW5iaW5kIHdoZW4gbmVlZGVkXG4gICAgICAgIHRoaXMucGxheUhhbmRsZXIgPSB0aGlzLnBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5tb3ZlSGFuZGxlciA9IHRoaXMubW92ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnN0b3BIYW5kbGVyID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XG5cbiAgICAgICAgLy8gc2V0IGRlZmF1bHQgdmFsdWVzIHRoYXQgd2UncmUgc3VwcGxpZWRcbiAgICAgICAgdGhpcy53YXZlZm9ybS52YWx1ZSA9IHRoaXMub3B0aW9ucy53YXZlZm9ybTtcbiAgICAgICAgdGhpcy5maWx0ZXIudmFsdWUgPSB0aGlzLm9wdGlvbnMuZmlsdGVyO1xuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcblxuICAgICAgICAvLyBiaW5kIFVJIGNvbnRyb2wgZXZlbnRzXG4gICAgICAgIHRoaXMucG93ZXJUb2dnbGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnRvZ2dsZVBvd2VyLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLndhdmVmb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuc2V0V2F2ZWZvcm0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuZmlsdGVyQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdGhpcy5zbGlkZXJDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLnNsaWRlckNoYW5nZS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBjcmVhdGUgV2ViIEF1ZGlvIG5vZGVzXG4gICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVCaXF1YWRGaWx0ZXIoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4gPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2Fpbk5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRGVsYXkgPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZURlbGF5KCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZURlbGF5Tm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2FpbiA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbiA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmNvbXByZXNzb3IgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUR5bmFtaWNzQ29tcHJlc3NvcigpO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBmcmVxdWVuY3kgYW5hbHlzZXIgbm9kZVxuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlQW5hbHlzZXIoKTtcbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuc21vb3RoaW5nVGltZUNvbnN0YW50ID0gMC44NTtcblxuICAgICAgICAvLyBzdGFydCBmQUYgZm9yIGZyZXF1ZW5jeSBhbmFseXNlclxuICAgICAgICB0aGlzLmFuaW1hdGVTcGVjdHJ1bSgpO1xuXG4gICAgICAgIC8vIHByZXZlbnQgZGVmYXVsdCBzY3JvbGxpbmcgd2hlbiB0b3VjaG1vdmUgZmlyZXMgb24gc3VyZmFjZVxuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgZSA9PiB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGhhbmRsZVJlc2l6ZSgpIHtcbiAgICAgICAgLy8gc2V0IGRlZmF1bHQgY2FudmFzIHNpemVcbiAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSB3aW5kb3cubWF0Y2hNZWRpYSgnKG1heC13aWR0aDogNTEycHgpJykubWF0Y2hlcyA/IHRydWUgOiBmYWxzZTtcbiAgICAgICAgdGhpcy5zZXRDYW52YXNTaXplKCk7XG5cbiAgICAgICAgLy8gbGlzdGVuIGZvciByZXNpemUgZXZlbnRzXG4gICAgICAgIHdpbmRvdy5tYXRjaE1lZGlhKCcobWF4LXdpZHRoOiA1MTJweCknKS5hZGRMaXN0ZW5lcihtcWwgPT4ge1xuICAgICAgICAgICAgaWYgKG1xbC5tYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzU21hbGxWaWV3cG9ydCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZXRDYW52YXNTaXplKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJvdXRlU291bmRzKCkge1xuICAgICAgICB0aGlzLnNvdXJjZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlT3NjaWxsYXRvcigpO1xuXG4gICAgICAgIHRoaXMuc2V0V2F2ZWZvcm0odGhpcy53YXZlZm9ybSk7XG4gICAgICAgIHRoaXMuZmlsdGVyQ2hhbmdlKHRoaXMuZmlsdGVyKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4uZ2Fpbi52YWx1ZSA9IHRoaXMuZmVlZGJhY2tHYWluSW5wdXQudmFsdWU7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5kZWxheVRpbWVJbnB1dC52YWx1ZTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuZ2Fpbi52YWx1ZSA9IDAuMjtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDA7XG5cbiAgICAgICAgdGhpcy5zb3VyY2UuY29ubmVjdCh0aGlzLm5vZGVzLm9zY1ZvbHVtZSk7XG4gICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lLmNvbm5lY3QodGhpcy5ub2Rlcy5maWx0ZXIpO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuY29ubmVjdCh0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbik7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuY29ubmVjdCh0aGlzLm5vZGVzLmNvbXByZXNzb3IpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbi5jb25uZWN0KHRoaXMubm9kZXMuZGVsYXkpO1xuICAgICAgICB0aGlzLm5vZGVzLmNvbXByZXNzb3IuY29ubmVjdCh0aGlzLm5vZGVzLnZvbHVtZSk7XG4gICAgICAgIHRoaXMubm9kZXMudm9sdW1lLmNvbm5lY3QodGhpcy5teUF1ZGlvQW5hbHlzZXIpO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5jb25uZWN0KHRoaXMubXlBdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xuICAgIH1cblxuICAgIHN0YXJ0T3NjKCkge1xuICAgICAgICBpZiAoIXRoaXMuc291cmNlLnN0YXJ0KSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdGFydCA9IHRoaXMuc291cmNlLm5vdGVPbjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvdXJjZS5zdGFydCgwKTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSB0cnVlO1xuICAgIH1cblxuICAgIHN0b3BPc2MoKSB7XG4gICAgICAgIGlmICghdGhpcy5zb3VyY2Uuc3RvcCkge1xuICAgICAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCA9IHRoaXMuc291cmNlLm5vdGVPZmY7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCgwKTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBiaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgIH1cblxuICAgIHVuYmluZFN1cmZhY2VFdmVudHMoKSB7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLnBsYXlIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLnBsYXlIYW5kbGVyKTtcbiAgICB9XG5cbiAgICB0b2dnbGVQb3dlcigpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BPc2MoKTtcbiAgICAgICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMudW5iaW5kU3VyZmFjZUV2ZW50cygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5yb3V0ZVNvdW5kcygpO1xuICAgICAgICAgICAgdGhpcy5zdGFydE9zYygpO1xuICAgICAgICAgICAgdGhpcy5iaW5kU3VyZmFjZUV2ZW50cygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tYWluLmNsYXNzTGlzdC50b2dnbGUoJ29mZicpO1xuICAgIH1cblxuICAgIHBsYXkoZSkge1xuICAgICAgICBsZXQgeCA9IGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaHN0YXJ0JyA/IGUudG91Y2hlc1swXS5wYWdlWSA6IGUucGFnZVk7XG4gICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuXG4gICAgICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaHN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy5oYXNUb3VjaCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoZS50eXBlID09PSAnbW91c2Vkb3duJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgIH1cblxuICAgICAgICB4ID0geCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICB5ID0geSAtIHRoaXMuc3VyZmFjZS5vZmZzZXRUb3A7XG5cbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDE7XG4gICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICB0aGlzLnNldEZpbHRlckZyZXF1ZW5jeSh5KTtcblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICAgICAgdGhpcy5maW5nZXIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBtb3ZlKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAoZS50eXBlID09PSAnbW91c2Vtb3ZlJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICB9XG5cbiAgICBzdG9wKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZmluZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgfVxuXG4gICAgdXBkYXRlT3V0cHV0cygpIHtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVPdXRwdXQudmFsdWUgPSBNYXRoLnJvdW5kKHRoaXMuZGVsYXlUaW1lSW5wdXQudmFsdWUgKiAxMDAwKSArICcgbXMnO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2Fpbk91dHB1dC52YWx1ZSA9IE1hdGgucm91bmQodGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZSAqIDEwKTtcbiAgICB9XG5cbiAgICBzZXRXYXZlZm9ybShvcHRpb24pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBvcHRpb24udmFsdWUgfHwgb3B0aW9uLnRhcmdldC52YWx1ZTtcbiAgICAgICAgdGhpcy5zb3VyY2UudHlwZSA9IHRoaXMuaXNTYWZhcmkgPyB0aGlzLndhdmVzLmdldCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBzbGlkZXJDaGFuZ2Uoc2xpZGVyKSB7XG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wT3NjKCk7XG4gICAgICAgICAgICBpZiAoc2xpZGVyLmlkID09PSAnZGVsYXknKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5kZWxheVRpbWUudmFsdWUgPSBzbGlkZXIudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNsaWRlci5pZCA9PT0gJ2ZlZWRiYWNrJykge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmdhaW4udmFsdWUgPSBzbGlkZXIudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGVPdXRwdXRzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGZpbHRlciBmcmVxdWVuY3kgYmFzZWQgb24gKHkpIGF4aXMgdmFsdWVcbiAgICAgKi9cbiAgICBzZXRGaWx0ZXJGcmVxdWVuY3koeSkge1xuICAgICAgICAvLyBtaW4gNDBIelxuICAgICAgICBjb25zdCBtaW4gPSA0MDtcbiAgICAgICAgLy8gbWF4IGhhbGYgb2YgdGhlIHNhbXBsaW5nIHJhdGVcbiAgICAgICAgY29uc3QgbWF4ID0gdGhpcy5teUF1ZGlvQ29udGV4dC5zYW1wbGVSYXRlIC8gMjtcbiAgICAgICAgLy8gTG9nYXJpdGhtIChiYXNlIDIpIHRvIGNvbXB1dGUgaG93IG1hbnkgb2N0YXZlcyBmYWxsIGluIHRoZSByYW5nZS5cbiAgICAgICAgY29uc3QgbnVtYmVyT2ZPY3RhdmVzID0gTWF0aC5sb2cobWF4IC8gbWluKSAvIE1hdGguTE4yO1xuICAgICAgICAvLyBDb21wdXRlIGEgbXVsdGlwbGllciBmcm9tIDAgdG8gMSBiYXNlZCBvbiBhbiBleHBvbmVudGlhbCBzY2FsZS5cbiAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IE1hdGgucG93KDIsIG51bWJlck9mT2N0YXZlcyAqICgoKDIgLyB0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0KSAqICh0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0IC0geSkpIC0gMS4wKSk7XG4gICAgICAgIC8vIEdldCBiYWNrIHRvIHRoZSBmcmVxdWVuY3kgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gbWF4ICogbXVsdGlwbGllcjtcbiAgICB9XG5cbiAgICBmaWx0ZXJDaGFuZ2Uob3B0aW9uKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gb3B0aW9uLnZhbHVlIHx8IG9wdGlvbi50YXJnZXQudmFsdWU7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLnR5cGUgPSB0aGlzLmlzU2FmYXJpID8gdGhpcy5maWx0ZXJzLmdldCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBhbmltYXRlU3BlY3RydW0oKSB7XG4gICAgICAgIC8vIExpbWl0IGNhbnZhcyByZWRyYXcgdG8gNDAgZnBzXG4gICAgICAgIHNldFRpbWVvdXQodGhpcy5vblRpY2suYmluZCh0aGlzKSwgMTAwMCAvIDQwKTtcbiAgICB9XG5cbiAgICBvblRpY2soKSB7XG4gICAgICAgIHRoaXMuZHJhd1NwZWN0cnVtKCk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGVTcGVjdHJ1bS5iaW5kKHRoaXMpLCB0aGlzLmNhbnZhcyk7XG4gICAgfVxuXG4gICAgc2V0Q2FudmFzU2l6ZSgpIHtcbiAgICAgICAgY29uc3QgY2FudmFzU2l6ZSA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMjU2IDogNTEyO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY2FudmFzLmhlaWdodCA9IGNhbnZhc1NpemUgLSAxMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3IHRoZSBjYW52YXMgZnJlcXVlbmN5IGRhdGEgZ3JhcGhcbiAgICAgKi9cbiAgICBkcmF3U3BlY3RydW0oKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1NpemUgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDI1NiA6IDUxMjtcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEwIDogMjA7XG4gICAgICAgIGNvbnN0IGJhckNvdW50ID0gTWF0aC5yb3VuZChjYW52YXNTaXplIC8gYmFyV2lkdGgpO1xuICAgICAgICBjb25zdCBmcmVxQnl0ZURhdGEgPSBuZXcgVWludDhBcnJheSh0aGlzLm15QXVkaW9BbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudCk7XG5cbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhc1NpemUsIGNhbnZhc1NpemUpO1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzFkMWMyNSc7XG5cbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZ2V0Qnl0ZUZyZXF1ZW5jeURhdGEoZnJlcUJ5dGVEYXRhKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJhckNvdW50OyBpICs9IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hZ25pdHVkZSA9IGZyZXFCeXRlRGF0YVtpXTtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEgOiAyO1xuICAgICAgICAgICAgLy8gc29tZSB2YWx1ZXMgbmVlZCBhZGp1c3RpbmcgdG8gZml0IG9uIHRoZSBjYW52YXNcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJhcldpZHRoICogaSwgY2FudmFzU2l6ZSwgYmFyV2lkdGggLSAxLCAtbWFnbml0dWRlICogbXVsdGlwbGllcik7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdhdmVwYWQ7XG4iXX0=
