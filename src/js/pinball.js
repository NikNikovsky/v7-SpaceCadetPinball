const ArcOS_DataFilePath = await fs.direct(
  util.join(workingDirectory, "bin/SpaceCadetPinball.data")
);
const ArcOS_WasmFilePath = await fs.direct(
  util.join(workingDirectory, "bin/SpaceCadetPinball.wasm")
);
const RUN = async (canvas, MASTER_CALLBACK) => {
  var Module = typeof Module !== "undefined" ? Module : {};
  if (!Module.expectedDataFileDownloads) {
    Module.expectedDataFileDownloads = 0;
  }
  Module.expectedDataFileDownloads++;
  (function () {
    var loadPackage = function (metadata) {
      var PACKAGE_PATH = "";
      if (typeof window === "object") {
        PACKAGE_PATH = window["encodeURIComponent"](
          window.location.pathname
            .toString()
            .substring(
              0,
              window.location.pathname.toString().lastIndexOf("/")
            ) + "/"
        );
      } else if (
        typeof process === "undefined" &&
        typeof location !== "undefined"
      ) {
        PACKAGE_PATH = encodeURIComponent(
          location.pathname
            .toString()
            .substring(0, location.pathname.toString().lastIndexOf("/")) + "/"
        );
      }
      var PACKAGE_NAME = ArcOS_DataFilePath;
      var REMOTE_PACKAGE_BASE = ArcOS_DataFilePath;
      if (
        typeof Module["locateFilePackage"] === "function" &&
        !Module["locateFile"]
      ) {
        Module["locateFile"] = Module["locateFilePackage"];
        err(
          "warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)"
        );
      }
      var REMOTE_PACKAGE_NAME = Module["locateFile"]
        ? Module["locateFile"](REMOTE_PACKAGE_BASE, "")
        : REMOTE_PACKAGE_BASE;
      var REMOTE_PACKAGE_SIZE = metadata["remote_package_size"];
      var PACKAGE_UUID = metadata["package_uuid"];
      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        if (typeof process === "object") {
          require("fs").readFile(packageName, function (err, contents) {
            if (err) {
              errback(err);
            } else {
              callback(contents.buffer);
            }
          });
          return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open("GET", packageName, true);
        xhr.responseType = "arraybuffer";
        xhr.onprogress = function (event) {
          var url = packageName;
          var size = packageSize;
          if (event.total) size = event.total;
          if (event.loaded) {
            if (!xhr.addedTotal) {
              xhr.addedTotal = true;
              if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
              Module.dataFileDownloads[url] = {
                loaded: event.loaded,
                total: size,
              };
            } else {
              Module.dataFileDownloads[url].loaded = event.loaded;
            }
            var total = 0;
            var loaded = 0;
            var num = 0;
            for (var download in Module.dataFileDownloads) {
              var data = Module.dataFileDownloads[download];
              total += data.total;
              loaded += data.loaded;
              num++;
            }
            total = Math.ceil((total * Module.expectedDataFileDownloads) / num);
            if (Module["setStatus"])
              Module["setStatus"](
                "Downloading data... (" + loaded + "/" + total + ")"
              );
          } else if (!Module.dataFileDownloads) {
            if (Module["setStatus"]) Module["setStatus"]("Downloading data...");
          }
        };
        xhr.onerror = function (event) {
          throw new Error("NetworkError for: " + packageName);
        };
        xhr.onload = function (event) {
          if (
            xhr.status == 200 ||
            xhr.status == 304 ||
            xhr.status == 206 ||
            (xhr.status == 0 && xhr.response)
          ) {
            var packageData = xhr.response;
            callback(packageData);
          } else {
            throw new Error(xhr.statusText + " : " + xhr.responseURL);
          }
        };
        xhr.send(null);
      }
      function handleError(error) {
        console.error("package error:", error);
      }
      var fetchedCallback = null;
      var fetched = Module["getPreloadedPackage"]
        ? Module["getPreloadedPackage"](
            REMOTE_PACKAGE_NAME,
            REMOTE_PACKAGE_SIZE
          )
        : null;
      if (!fetched)
        fetchRemotePackage(
          REMOTE_PACKAGE_NAME,
          REMOTE_PACKAGE_SIZE,
          function (data) {
            if (fetchedCallback) {
              fetchedCallback(data);
              fetchedCallback = null;
            } else {
              fetched = data;
            }
          },
          handleError
        );
      function runWithFS() {
        function assert(check, msg) {
          if (!check) throw msg + new Error().stack;
        }
        Module["FS_createPath"]("/", "game_resources", true, true);
        function DataRequest(start, end, audio) {
          this.start = start;
          this.end = end;
          this.audio = audio;
        }
        DataRequest.prototype = {
          requests: {},
          open: function (mode, name) {
            this.name = name;
            this.requests[name] = this;
            Module["addRunDependency"]("fp " + this.name);
          },
          send: function () {},
          onload: function () {
            var byteArray = this.byteArray.subarray(this.start, this.end);
            this.finish(byteArray);
          },
          finish: function (byteArray) {
            var that = this;
            Module["FS_createDataFile"](
              this.name,
              null,
              byteArray,
              true,
              true,
              true
            );
            Module["removeRunDependency"]("fp " + that.name);
            this.requests[this.name] = null;
          },
        };
        var files = metadata["files"];
        for (var i = 0; i < files.length; ++i) {
          new DataRequest(
            files[i]["start"],
            files[i]["end"],
            files[i]["audio"]
          ).open("GET", files[i]["filename"]);
        }
        function processPackageData(arrayBuffer) {
          assert(arrayBuffer, "Loading data file failed.");
          assert(
            arrayBuffer instanceof ArrayBuffer,
            "bad input to processPackageData"
          );
          var byteArray = new Uint8Array(arrayBuffer);
          DataRequest.prototype.byteArray = byteArray;
          var files = metadata["files"];
          for (var i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }
          Module["removeRunDependency"](
            "datafile_../bin/SpaceCadetPinball.data"
          );
        }
        Module["addRunDependency"]("datafile_../bin/SpaceCadetPinball.data");
        if (!Module.preloadResults) Module.preloadResults = {};
        Module.preloadResults[PACKAGE_NAME] = {
          fromCache: false,
        };
        if (fetched) {
          processPackageData(fetched);
          fetched = null;
        } else {
          fetchedCallback = processPackageData;
        }
      }
      if (Module["calledRun"]) {
        runWithFS();
      } else {
        if (!Module["preRun"]) Module["preRun"] = [];
        Module["preRun"].push(runWithFS);
      }
    };
    loadPackage({
      files: [
        {
          filename: "/game_resources/SOUND29.WAV",
          start: 0,
          end: 10364,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND560.WAV",
          start: 10364,
          end: 39368,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND30.WAV",
          start: 39368,
          end: 61938,
          audio: 0,
        },
        {
          filename: "/game_resources/table.bmp",
          start: 61938,
          end: 401116,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND54.WAV",
          start: 401116,
          end: 419366,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND12.WAV",
          start: 419366,
          end: 423662,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND17.WAV",
          start: 423662,
          end: 425752,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND27.WAV",
          start: 425752,
          end: 445994,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND22.WAV",
          start: 445994,
          end: 453370,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND104.WAV",
          start: 453370,
          end: 454596,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND42.WAV",
          start: 454596,
          end: 483736,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND112.WAV",
          start: 483736,
          end: 484560,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND24.WAV",
          start: 484560,
          end: 496666,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND49D.WAV",
          start: 496666,
          end: 499996,
          audio: 0,
        },
        {
          filename: "/game_resources/PINBALL.MID",
          start: 499996,
          end: 608603,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND3.WAV",
          start: 608603,
          end: 631461,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND16.WAV",
          start: 631461,
          end: 632507,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND43.WAV",
          start: 632507,
          end: 655303,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND26.WAV",
          start: 655303,
          end: 662609,
          audio: 0,
        },
        {
          filename: "/game_resources/README.txt",
          start: 662609,
          end: 662716,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND20.WAV",
          start: 662716,
          end: 671366,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND111.WAV",
          start: 671366,
          end: 672256,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND8.WAV",
          start: 672256,
          end: 674358,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND5.WAV",
          start: 674358,
          end: 677538,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND58.WAV",
          start: 677538,
          end: 680946,
          audio: 0,
        },
        {
          filename: "/game_resources/FONT.DAT",
          start: 680946,
          end: 684893,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND1.WAV",
          start: 684893,
          end: 740383,
          audio: 0,
        },
        {
          filename: "/game_resources/PINBALL2.MID",
          start: 740383,
          end: 769271,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND28.WAV",
          start: 769271,
          end: 777921,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND13.WAV",
          start: 777921,
          end: 785955,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND735.WAV",
          start: 785955,
          end: 813223,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND105.WAV",
          start: 813223,
          end: 815191,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND181.WAV",
          start: 815191,
          end: 842663,
          audio: 0,
        },
        {
          filename: "/game_resources/wavemix.inf",
          start: 842663,
          end: 845350,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND240.WAV",
          start: 845350,
          end: 859950,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND9.WAV",
          start: 859950,
          end: 880048,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND18.WAV",
          start: 880048,
          end: 884034,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND21.WAV",
          start: 884034,
          end: 893228,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND6.WAV",
          start: 893228,
          end: 897604,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND45.WAV",
          start: 897604,
          end: 907374,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND50.WAV",
          start: 907374,
          end: 919448,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND999.WAV",
          start: 919448,
          end: 926190,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND528.WAV",
          start: 926190,
          end: 935122,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND243.WAV",
          start: 935122,
          end: 955834,
          audio: 0,
        },
        {
          filename: "/game_resources/PINBALL.DAT",
          start: 955834,
          end: 1884534,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND53.WAV",
          start: 1884534,
          end: 1893556,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND131.WAV",
          start: 1893556,
          end: 1894846,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND19.WAV",
          start: 1894846,
          end: 1900076,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND39.WAV",
          start: 1900076,
          end: 1928358,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND35.WAV",
          start: 1928358,
          end: 1947856,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND713.WAV",
          start: 1947856,
          end: 1962448,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND38.WAV",
          start: 1962448,
          end: 1975472,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND108.WAV",
          start: 1975472,
          end: 1983226,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND55.WAV",
          start: 1983226,
          end: 2005116,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND57.WAV",
          start: 2005116,
          end: 2035618,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND7.WAV",
          start: 2035618,
          end: 2062060,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND68.WAV",
          start: 2062060,
          end: 2094462,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND136.WAV",
          start: 2094462,
          end: 2113744,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND34.WAV",
          start: 2113744,
          end: 2115264,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND827.WAV",
          start: 2115264,
          end: 2162494,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND36.WAV",
          start: 2162494,
          end: 2196342,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND25.WAV",
          start: 2196342,
          end: 2222046,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND65.WAV",
          start: 2222046,
          end: 2239722,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND563.WAV",
          start: 2239722,
          end: 2263914,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND4.WAV",
          start: 2263914,
          end: 2280540,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND14.WAV",
          start: 2280540,
          end: 2283542,
          audio: 0,
        },
        {
          filename: "/game_resources/SOUND49.WAV",
          start: 2283542,
          end: 2285418,
          audio: 0,
        },
      ],
      remote_package_size: 2285418,
      package_uuid: "ddf920d4-7275-4e96-b7b9-35a81f87a5f2",
    });
  })();
  var moduleOverrides = {};
  var key;
  for (key in Module) {
    if (Module.hasOwnProperty(key)) {
      moduleOverrides[key] = Module[key];
    }
  }
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = function (status, toThrow) {
    throw toThrow;
  };
  var ENVIRONMENT_IS_WEB = false;
  var ENVIRONMENT_IS_WORKER = false;
  var ENVIRONMENT_IS_NODE = false;
  var ENVIRONMENT_IS_SHELL = false;
  ENVIRONMENT_IS_WEB = typeof window === "object";
  ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
  ENVIRONMENT_IS_NODE =
    typeof process === "object" &&
    typeof process.versions === "object" &&
    typeof process.versions.node === "string";
  ENVIRONMENT_IS_SHELL =
    !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  var read_, readAsync, readBinary, setWindowTitle;
  var nodeFS;
  var nodePath;
  if (ENVIRONMENT_IS_NODE) {
    if (ENVIRONMENT_IS_WORKER) {
      scriptDirectory = require("path").dirname(scriptDirectory) + "/";
    } else {
      scriptDirectory = __dirname + "/";
    }
    read_ = function shell_read(filename, binary) {
      if (!nodeFS) nodeFS = require("fs");
      if (!nodePath) nodePath = require("path");
      filename = nodePath["normalize"](filename);
      return nodeFS["readFileSync"](filename, binary ? null : "utf8");
    };
    readBinary = function readBinary(filename) {
      var ret = read_(filename, true);
      if (!ret.buffer) {
        ret = new Uint8Array(ret);
      }
      assert(ret.buffer);
      return ret;
    };
    if (process["argv"].length > 1) {
      thisProgram = process["argv"][1].replace(/\\/g, "/");
    }
    arguments_ = process["argv"].slice(2);
    if (typeof module !== "undefined") {
      module["exports"] = Module;
    }
    process["on"]("uncaughtException", function (ex) {
      if (!(ex instanceof ExitStatus)) {
        throw ex;
      }
    });
    process["on"]("unhandledRejection", abort);
    quit_ = function (status) {
      process["exit"](status);
    };
    Module["inspect"] = function () {
      return "[Emscripten Module object]";
    };
  } else if (ENVIRONMENT_IS_SHELL) {
    if (typeof read != "undefined") {
      read_ = function shell_read(f) {
        return read(f);
      };
    }
    readBinary = function readBinary(f) {
      var data;
      if (typeof readbuffer === "function") {
        return new Uint8Array(readbuffer(f));
      }
      data = read(f, "binary");
      assert(typeof data === "object");
      return data;
    };
    if (typeof scriptArgs != "undefined") {
      arguments_ = scriptArgs;
    } else if (typeof arguments != "undefined") {
      arguments_ = arguments;
    }
    if (typeof quit === "function") {
      quit_ = function (status) {
        quit(status);
      };
    }
    if (typeof print !== "undefined") {
      if (typeof console === "undefined") console = {};
      console.log = print;
      console.warn = console.error =
        typeof printErr !== "undefined" ? printErr : print;
    }
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    if (ENVIRONMENT_IS_WORKER) {
      scriptDirectory = self.location.href;
    } else if (typeof document !== "undefined" && document.currentScript) {
      scriptDirectory = document.currentScript.src;
    }
    if (scriptDirectory.indexOf("blob:") !== 0) {
      scriptDirectory = scriptDirectory.substr(
        0,
        scriptDirectory.lastIndexOf("/") + 1
      );
    } else {
      scriptDirectory = "";
    }
    {
      read_ = function (url) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText;
      };
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = function (url) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(xhr.response);
        };
      }
      readAsync = function (url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function () {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
            onload(xhr.response);
            return;
          }
          onerror();
        };
        xhr.onerror = onerror;
        xhr.send(null);
      };
    }
    setWindowTitle = function (title) {
      document.title = title;
    };
  } else {
  }
  var out = Module["print"] || console.log.bind(console);
  var err = Module["printErr"] || console.warn.bind(console);
  for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
      Module[key] = moduleOverrides[key];
    }
  }
  moduleOverrides = null;
  if (Module["arguments"]) arguments_ = Module["arguments"];
  if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
  if (Module["quit"]) quit_ = Module["quit"];
  var STACK_ALIGN = 16;
  function alignMemory(size, factor) {
    if (!factor) factor = STACK_ALIGN;
    return Math.ceil(size / factor) * factor;
  }
  function warnOnce(text) {
    if (!warnOnce.shown) warnOnce.shown = {};
    if (!warnOnce.shown[text]) {
      warnOnce.shown[text] = 1;
      err(text);
    }
  }
  var tempRet0 = 0;
  var setTempRet0 = function (value) {
    tempRet0 = value;
  };
  var wasmBinary;
  if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
  var noExitRuntime = Module["noExitRuntime"] || true;
  if (typeof WebAssembly !== "object") {
    abort("no native wasm support detected");
  }
  function setValue(ptr, value, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*") type = "i32";
    switch (type) {
      case "i1":
        HEAP8[ptr >> 0] = value;
        break;
      case "i8":
        HEAP8[ptr >> 0] = value;
        break;
      case "i16":
        HEAP16[ptr >> 1] = value;
        break;
      case "i32":
        HEAP32[ptr >> 2] = value;
        break;
      case "i64":
        (tempI64 = [
          value >>> 0,
          ((tempDouble = value),
          +Math.abs(tempDouble) >= 1
            ? tempDouble > 0
              ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) |
                  0) >>>
                0
              : ~~+Math.ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                ) >>> 0
            : 0),
        ]),
          (HEAP32[ptr >> 2] = tempI64[0]),
          (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
        break;
      case "float":
        HEAPF32[ptr >> 2] = value;
        break;
      case "double":
        HEAPF64[ptr >> 3] = value;
        break;
      default:
        abort("invalid type for setValue: " + type);
    }
  }
  var wasmMemory;
  var ABORT = false;
  var EXITSTATUS;
  function assert(condition, text) {
    if (!condition) {
      abort("Assertion failed: " + text);
    }
  }
  var ALLOC_NORMAL = 0;
  var ALLOC_STACK = 1;
  function allocate(slab, allocator) {
    var ret;
    if (allocator == ALLOC_STACK) {
      ret = stackAlloc(slab.length);
    } else {
      ret = _malloc(slab.length);
    }
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }
  var UTF8Decoder =
    typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;
  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
      return UTF8Decoder.decode(heap.subarray(idx, endPtr));
    } else {
      var str = "";
      while (idx < endPtr) {
        var u0 = heap[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heap[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1);
          continue;
        }
        var u2 = heap[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        }
      }
    }
    return str;
  }
  function UTF8ToString(ptr, maxBytesToRead) {
    return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
  }
  function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343) {
        var u1 = str.charCodeAt(++i);
        u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
      }
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | (u >> 6);
        heap[outIdx++] = 128 | (u & 63);
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | (u >> 12);
        heap[outIdx++] = 128 | ((u >> 6) & 63);
        heap[outIdx++] = 128 | (u & 63);
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | (u >> 18);
        heap[outIdx++] = 128 | ((u >> 12) & 63);
        heap[outIdx++] = 128 | ((u >> 6) & 63);
        heap[outIdx++] = 128 | (u & 63);
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  }
  function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  }
  function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343)
        u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
      if (u <= 127) ++len;
      else if (u <= 2047) len += 2;
      else if (u <= 65535) len += 3;
      else len += 4;
    }
    return len;
  }
  var UTF16Decoder =
    typeof TextDecoder !== "undefined"
      ? new TextDecoder("utf-16le")
      : undefined;
  function UTF16ToString(ptr, maxBytesToRead) {
    var endPtr = ptr;
    var idx = endPtr >> 1;
    var maxIdx = idx + maxBytesToRead / 2;
    while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
    endPtr = idx << 1;
    if (endPtr - ptr > 32 && UTF16Decoder) {
      return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
    } else {
      var str = "";
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[(ptr + i * 2) >> 1];
        if (codeUnit == 0) break;
        str += String.fromCharCode(codeUnit);
      }
      return str;
    }
  }
  function stringToUTF16(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
      maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite =
      maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
      var codeUnit = str.charCodeAt(i);
      HEAP16[outPtr >> 1] = codeUnit;
      outPtr += 2;
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr;
  }
  function lengthBytesUTF16(str) {
    return str.length * 2;
  }
  function UTF32ToString(ptr, maxBytesToRead) {
    var i = 0;
    var str = "";
    while (!(i >= maxBytesToRead / 4)) {
      var utf32 = HEAP32[(ptr + i * 4) >> 2];
      if (utf32 == 0) break;
      ++i;
      if (utf32 >= 65536) {
        var ch = utf32 - 65536;
        str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
      } else {
        str += String.fromCharCode(utf32);
      }
    }
    return str;
  }
  function stringToUTF32(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
      maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 4) return 0;
    var startPtr = outPtr;
    var endPtr = startPtr + maxBytesToWrite - 4;
    for (var i = 0; i < str.length; ++i) {
      var codeUnit = str.charCodeAt(i);
      if (codeUnit >= 55296 && codeUnit <= 57343) {
        var trailSurrogate = str.charCodeAt(++i);
        codeUnit =
          (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
      }
      HEAP32[outPtr >> 2] = codeUnit;
      outPtr += 4;
      if (outPtr + 4 > endPtr) break;
    }
    HEAP32[outPtr >> 2] = 0;
    return outPtr - startPtr;
  }
  function lengthBytesUTF32(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var codeUnit = str.charCodeAt(i);
      if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
      len += 4;
    }
    return len;
  }
  function allocateUTF8(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret) stringToUTF8Array(str, HEAP8, ret, size);
    return ret;
  }
  function allocateUTF8OnStack(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8Array(str, HEAP8, ret, size);
    return ret;
  }
  function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
      HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0;
  }
  function alignUp(x, multiple) {
    if (x % multiple > 0) {
      x += multiple - (x % multiple);
    }
    return x;
  }
  var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  function updateGlobalBufferAndViews(buf) {
    buffer = buf;
    Module["HEAP8"] = HEAP8 = new Int8Array(buf);
    Module["HEAP16"] = HEAP16 = new Int16Array(buf);
    Module["HEAP32"] = HEAP32 = new Int32Array(buf);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(buf);
  }
  var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;
  var wasmTable;
  var __ATPRERUN__ = [];
  var __ATINIT__ = [];
  var __ATMAIN__ = [];
  var __ATEXIT__ = [];
  var __ATPOSTRUN__ = [];
  var runtimeInitialized = false;
  var runtimeExited = false;
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function")
        Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(__ATPRERUN__);
  }
  function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
    FS.ignorePermissions = false;
    TTY.init();
    callRuntimeCallbacks(__ATINIT__);
  }
  function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
  }
  function exitRuntime() {
    runtimeExited = true;
  }
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function")
        Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
  }
  function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
  }
  function addOnInit(cb) {
    __ATINIT__.unshift(cb);
  }
  function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
  }
  var runDependencies = 0;
  var runDependencyWatcher = null;
  var dependenciesFulfilled = null;
  function getUniqueRunDependency(id) {
    return id;
  }
  function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
      Module["monitorRunDependencies"](runDependencies);
    }
  }
  function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
      Module["monitorRunDependencies"](runDependencies);
    }
    if (runDependencies == 0) {
      if (runDependencyWatcher !== null) {
        clearInterval(runDependencyWatcher);
        runDependencyWatcher = null;
      }
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }
  Module["preloadedImages"] = {};
  Module["preloadedAudios"] = {};
  function abort(what) {
    if (Module["onAbort"]) {
      Module["onAbort"](what);
    }
    what += "";
    err(what);
    ABORT = true;
    EXITSTATUS = 1;
    what = "abort(" + what + "). Build with -s ASSERTIONS=1 for more info.";
    var e = new WebAssembly.RuntimeError(what);
    throw e;
  }
  var dataURIPrefix = "data:application/octet-stream;base64,";
  function isDataURI(filename) {
    return filename.startsWith(dataURIPrefix);
  }
  function isFileURI(filename) {
    return filename.startsWith("file://");
  }
  var wasmBinaryFile;
  wasmBinaryFile = ArcOS_WasmFilePath;
  if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile);
  }
  function getBinary(file) {
    try {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      } else {
        throw "both async and sync fetching of the wasm failed";
      }
    } catch (err) {
      abort(err);
    }
  }
  function getBinaryPromise() {
    if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
      if (typeof fetch === "function" && !isFileURI(wasmBinaryFile)) {
        return fetch(wasmBinaryFile, {
          credentials: "same-origin",
        })
          .then(function (response) {
            if (!response["ok"]) {
              throw (
                "failed to load wasm binary file at '" + wasmBinaryFile + "'"
              );
            }
            return response["arrayBuffer"]();
          })
          .catch(function () {
            return getBinary(wasmBinaryFile);
          });
      } else {
        if (readAsync) {
          return new Promise(function (resolve, reject) {
            readAsync(
              wasmBinaryFile,
              function (response) {
                resolve(new Uint8Array(response));
              },
              reject
            );
          });
        }
      }
    }
    return Promise.resolve().then(function () {
      return getBinary(wasmBinaryFile);
    });
  }
  function createWasm() {
    var info = {
      a: asmLibraryArg,
    };
    function receiveInstance(instance, module) {
      var exports = instance.exports;
      Module["asm"] = exports;
      wasmMemory = Module["asm"]["Gd"];
      updateGlobalBufferAndViews(wasmMemory.buffer);
      wasmTable = Module["asm"]["Id"];
      addOnInit(Module["asm"]["Hd"]);
      removeRunDependency("wasm-instantiate");
    }
    addRunDependency("wasm-instantiate");
    function receiveInstantiationResult(result) {
      receiveInstance(result["instance"]);
    }
    function instantiateArrayBuffer(receiver) {
      return getBinaryPromise()
        .then(function (binary) {
          var result = WebAssembly.instantiate(binary, info);
          return result;
        })
        .then(receiver, function (reason) {
          err("failed to asynchronously prepare wasm: " + reason);
          abort(reason);
        });
    }
    function instantiateAsync() {
      if (
        !wasmBinary &&
        typeof WebAssembly.instantiateStreaming === "function" &&
        !isDataURI(wasmBinaryFile) &&
        !isFileURI(wasmBinaryFile) &&
        typeof fetch === "function"
      ) {
        return fetch(wasmBinaryFile, {
          credentials: "same-origin",
        }).then(function (response) {
          var result = WebAssembly.instantiateStreaming(response, info);
          return result.then(receiveInstantiationResult, function (reason) {
            err("wasm streaming compile failed: " + reason);
            err("falling back to ArrayBuffer instantiation");
            return instantiateArrayBuffer(receiveInstantiationResult);
          });
        });
      } else {
        return instantiateArrayBuffer(receiveInstantiationResult);
      }
    }
    if (Module["instantiateWasm"]) {
      try {
        var exports = Module["instantiateWasm"](info, receiveInstance);
        return exports;
      } catch (e) {
        err("Module.instantiateWasm callback failed with error: " + e);
        return false;
      }
    }
    instantiateAsync();
    return {};
  }
  var tempDouble;
  var tempI64;
  var ASM_CONSTS = {
    3402188: function ($0) {
      var str =
        UTF8ToString($0) + "\n\n" + "Abort/Retry/Ignore/AlwaysIgnore? [ariA] :";
      var reply = window.prompt(str, "i");
      if (reply === null) {
        reply = "i";
      }
      return allocate(intArrayFromString(reply), "i8", ALLOC_NORMAL);
    },
    3402413: function ($0, $1) {
      alert(UTF8ToString($0) + "\n\n" + UTF8ToString($1));
    },
    3402470: function ($0, $1, $2) {
      var w = $0;
      var h = $1;
      var pixels = $2;
      if (!Module["SDL2"]) Module["SDL2"] = {};
      var SDL2 = Module["SDL2"];
      if (SDL2.ctxCanvas !== Module["canvas"]) {
        SDL2.ctx = Module["createContext"](Module["canvas"], false, true);
        SDL2.ctxCanvas = Module["canvas"];
      }
      if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) {
        SDL2.image = SDL2.ctx.createImageData(w, h);
        SDL2.w = w;
        SDL2.h = h;
        SDL2.imageCtx = SDL2.ctx;
      }
      var data = SDL2.image.data;
      var src = pixels >> 2;
      var dst = 0;
      var num;
      if (
        typeof CanvasPixelArray !== "undefined" &&
        data instanceof CanvasPixelArray
      ) {
        num = data.length;
        while (dst < num) {
          var val = HEAP32[src];
          data[dst] = val & 255;
          data[dst + 1] = (val >> 8) & 255;
          data[dst + 2] = (val >> 16) & 255;
          data[dst + 3] = 255;
          src++;
          dst += 4;
        }
      } else {
        if (SDL2.data32Data !== data) {
          SDL2.data32 = new Int32Array(data.buffer);
          SDL2.data8 = new Uint8Array(data.buffer);
        }
        var data32 = SDL2.data32;
        num = data32.length;
        data32.set(HEAP32.subarray(src, src + num));
        var data8 = SDL2.data8;
        var i = 3;
        var j = i + 4 * num;
        if (num % 8 == 0) {
          while (i < j) {
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
            data8[i] = 255;
            i = (i + 4) | 0;
          }
        } else {
          while (i < j) {
            data8[i] = 255;
            i = (i + 4) | 0;
          }
        }
      }
      SDL2.ctx.putImageData(SDL2.image, 0, 0);
      return 0;
    },
    3403925: function ($0, $1, $2, $3, $4) {
      var w = $0;
      var h = $1;
      var hot_x = $2;
      var hot_y = $3;
      var pixels = $4;
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      var image = ctx.createImageData(w, h);
      var data = image.data;
      var src = pixels >> 2;
      var dst = 0;
      var num;
      if (
        typeof CanvasPixelArray !== "undefined" &&
        data instanceof CanvasPixelArray
      ) {
        num = data.length;
        while (dst < num) {
          var val = HEAP32[src];
          data[dst] = val & 255;
          data[dst + 1] = (val >> 8) & 255;
          data[dst + 2] = (val >> 16) & 255;
          data[dst + 3] = (val >> 24) & 255;
          src++;
          dst += 4;
        }
      } else {
        var data32 = new Int32Array(data.buffer);
        num = data32.length;
        data32.set(HEAP32.subarray(src, src + num));
      }
      ctx.putImageData(image, 0, 0);
      var url =
        hot_x === 0 && hot_y === 0
          ? "url(" + canvas.toDataURL() + "), auto"
          : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto";
      var urlBuf = _malloc(url.length + 1);
      stringToUTF8(url, urlBuf, url.length + 1);
      return urlBuf;
    },
    3404914: function ($0) {
      if (Module["canvas"]) {
        Module["canvas"].style["cursor"] = UTF8ToString($0);
      }
      return 0;
    },
    3405007: function () {
      if (Module["canvas"]) {
        Module["canvas"].style["cursor"] = "none";
      }
    },
    3405076: function () {
      return screen.width;
    },
    3405101: function () {
      return screen.height;
    },
    3405127: function () {
      return window.innerWidth;
    },
    3405157: function () {
      return window.innerHeight;
    },
    3405188: function ($0) {
      if (typeof setWindowTitle !== "undefined") {
        setWindowTitle(UTF8ToString($0));
      }
      return 0;
    },
    3405283: function () {
      if (typeof AudioContext !== "undefined") {
        return 1;
      } else if (typeof webkitAudioContext !== "undefined") {
        return 1;
      }
      return 0;
    },
    3405420: function () {
      if (
        typeof navigator.mediaDevices !== "undefined" &&
        typeof navigator.mediaDevices.getUserMedia !== "undefined"
      ) {
        return 1;
      } else if (typeof navigator.webkitGetUserMedia !== "undefined") {
        return 1;
      }
      return 0;
    },
    3405644: function ($0) {
      if (typeof Module["SDL2"] === "undefined") {
        Module["SDL2"] = {};
      }
      var SDL2 = Module["SDL2"];
      if (!$0) {
        SDL2.audio = {};
      } else {
        SDL2.capture = {};
      }
      if (!SDL2.audioContext) {
        if (typeof AudioContext !== "undefined") {
          SDL2.audioContext = new AudioContext();
        } else if (typeof webkitAudioContext !== "undefined") {
          SDL2.audioContext = new webkitAudioContext();
        }
        if (SDL2.audioContext) {
          autoResumeAudioContext(SDL2.audioContext);
        }
      }
      return SDL2.audioContext === undefined ? -1 : 0;
    },
    3406137: function () {
      var SDL2 = Module["SDL2"];
      return SDL2.audioContext.sampleRate;
    },
    3406205: function ($0, $1, $2, $3) {
      var SDL2 = Module["SDL2"];
      var have_microphone = function (stream) {
        if (SDL2.capture.silenceTimer !== undefined) {
          clearTimeout(SDL2.capture.silenceTimer);
          SDL2.capture.silenceTimer = undefined;
        }
        SDL2.capture.mediaStreamNode =
          SDL2.audioContext.createMediaStreamSource(stream);
        SDL2.capture.scriptProcessorNode =
          SDL2.audioContext.createScriptProcessor($1, $0, 1);
        SDL2.capture.scriptProcessorNode.onaudioprocess = function (
          audioProcessingEvent
        ) {
          if (SDL2 === undefined || SDL2.capture === undefined) {
            return;
          }
          audioProcessingEvent.outputBuffer.getChannelData(0).fill(0);
          SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer;
          dynCall("vi", $2, [$3]);
        };
        SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode);
        SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination);
        SDL2.capture.stream = stream;
      };
      var no_microphone = function (error) {};
      SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer(
        $0,
        $1,
        SDL2.audioContext.sampleRate
      );
      SDL2.capture.silenceBuffer.getChannelData(0).fill(0);
      var silence_callback = function () {
        SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer;
        dynCall("vi", $2, [$3]);
      };
      SDL2.capture.silenceTimer = setTimeout(
        silence_callback,
        ($1 / SDL2.audioContext.sampleRate) * 1e3
      );
      if (
        navigator.mediaDevices !== undefined &&
        navigator.mediaDevices.getUserMedia !== undefined
      ) {
        navigator.mediaDevices
          .getUserMedia({
            audio: true,
            video: false,
          })
          .then(have_microphone)
          .catch(no_microphone);
      } else if (navigator.webkitGetUserMedia !== undefined) {
        navigator.webkitGetUserMedia(
          {
            audio: true,
            video: false,
          },
          have_microphone,
          no_microphone
        );
      }
    },
    3407857: function ($0, $1, $2, $3) {
      var SDL2 = Module["SDL2"];
      SDL2.audio.scriptProcessorNode = SDL2.audioContext[
        "createScriptProcessor"
      ]($1, 0, $0);
      SDL2.audio.scriptProcessorNode["onaudioprocess"] = function (e) {
        if (SDL2 === undefined || SDL2.audio === undefined) {
          return;
        }
        SDL2.audio.currentOutputBuffer = e["outputBuffer"];
        dynCall("vi", $2, [$3]);
      };
      SDL2.audio.scriptProcessorNode["connect"](
        SDL2.audioContext["destination"]
      );
    },
    3408267: function ($0, $1) {
      var SDL2 = Module["SDL2"];
      var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels;
      for (var c = 0; c < numChannels; ++c) {
        var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c);
        if (channelData.length != $1) {
          throw (
            "Web Audio capture buffer length mismatch! Destination size: " +
            channelData.length +
            " samples vs expected " +
            $1 +
            " samples!"
          );
        }
        if (numChannels == 1) {
          for (var j = 0; j < $1; ++j) {
            setValue($0 + j * 4, channelData[j], "float");
          }
        } else {
          for (var j = 0; j < $1; ++j) {
            setValue($0 + (j * numChannels + c) * 4, channelData[j], "float");
          }
        }
      }
    },
    3408872: function ($0, $1) {
      var SDL2 = Module["SDL2"];
      var numChannels = SDL2.audio.currentOutputBuffer["numberOfChannels"];
      for (var c = 0; c < numChannels; ++c) {
        var channelData = SDL2.audio.currentOutputBuffer["getChannelData"](c);
        if (channelData.length != $1) {
          throw (
            "Web Audio output buffer length mismatch! Destination size: " +
            channelData.length +
            " samples vs expected " +
            $1 +
            " samples!"
          );
        }
        for (var j = 0; j < $1; ++j) {
          channelData[j] = HEAPF32[($0 + ((j * numChannels + c) << 2)) >> 2];
        }
      }
    },
    3409352: function ($0) {
      var SDL2 = Module["SDL2"];
      if ($0) {
        if (SDL2.capture.silenceTimer !== undefined) {
          clearTimeout(SDL2.capture.silenceTimer);
        }
        if (SDL2.capture.stream !== undefined) {
          var tracks = SDL2.capture.stream.getAudioTracks();
          for (var i = 0; i < tracks.length; i++) {
            SDL2.capture.stream.removeTrack(tracks[i]);
          }
          SDL2.capture.stream = undefined;
        }
        if (SDL2.capture.scriptProcessorNode !== undefined) {
          SDL2.capture.scriptProcessorNode.onaudioprocess = function (
            audioProcessingEvent
          ) {};
          SDL2.capture.scriptProcessorNode.disconnect();
          SDL2.capture.scriptProcessorNode = undefined;
        }
        if (SDL2.capture.mediaStreamNode !== undefined) {
          SDL2.capture.mediaStreamNode.disconnect();
          SDL2.capture.mediaStreamNode = undefined;
        }
        if (SDL2.capture.silenceBuffer !== undefined) {
          SDL2.capture.silenceBuffer = undefined;
        }
        SDL2.capture = undefined;
      } else {
        if (SDL2.audio.scriptProcessorNode != undefined) {
          SDL2.audio.scriptProcessorNode.disconnect();
          SDL2.audio.scriptProcessorNode = undefined;
        }
        SDL2.audio = undefined;
      }
      if (
        SDL2.audioContext !== undefined &&
        SDL2.audio === undefined &&
        SDL2.capture === undefined
      ) {
        SDL2.audioContext.close();
        SDL2.audioContext = undefined;
      }
    },
  };
  function listenOnce(object, event, func) {
    object.addEventListener(event, func, {
      once: true,
    });
  }
  function autoResumeAudioContext(ctx, elements) {
    if (!elements) {
      elements = [document, document.getElementById("canvas")];
    }
    ["keydown", "mousedown", "touchstart"].forEach(function (event) {
      elements.forEach(function (element) {
        if (element) {
          listenOnce(element, event, function () {
            if (ctx.state === "suspended") ctx.resume();
          });
        }
      });
    });
  }
  function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
      var callback = callbacks.shift();
      if (typeof callback == "function") {
        callback(Module);
        continue;
      }
      var func = callback.func;
      if (typeof func === "number") {
        if (callback.arg === undefined) {
          wasmTable.get(func)();
        } else {
          wasmTable.get(func)(callback.arg);
        }
      } else {
        func(callback.arg === undefined ? null : callback.arg);
      }
    }
  }
  function dynCallLegacy(sig, ptr, args) {
    var f = Module["dynCall_" + sig];
    return args && args.length
      ? f.apply(null, [ptr].concat(args))
      : f.call(null, ptr);
  }
  function dynCall(sig, ptr, args) {
    if (sig.includes("j")) {
      return dynCallLegacy(sig, ptr, args);
    }
    return wasmTable.get(ptr).apply(null, args);
  }
  var runtimeKeepaliveCounter = 0;
  function keepRuntimeAlive() {
    return noExitRuntime || runtimeKeepaliveCounter > 0;
  }
  var ExceptionInfoAttrs = {
    DESTRUCTOR_OFFSET: 0,
    REFCOUNT_OFFSET: 4,
    TYPE_OFFSET: 8,
    CAUGHT_OFFSET: 12,
    RETHROWN_OFFSET: 13,
    SIZE: 16,
  };
  function ___cxa_allocate_exception(size) {
    return _malloc(size + ExceptionInfoAttrs.SIZE) + ExceptionInfoAttrs.SIZE;
  }
  function ExceptionInfo(excPtr) {
    this.excPtr = excPtr;
    this.ptr = excPtr - ExceptionInfoAttrs.SIZE;
    this.set_type = function (type) {
      HEAP32[(this.ptr + ExceptionInfoAttrs.TYPE_OFFSET) >> 2] = type;
    };
    this.get_type = function () {
      return HEAP32[(this.ptr + ExceptionInfoAttrs.TYPE_OFFSET) >> 2];
    };
    this.set_destructor = function (destructor) {
      HEAP32[(this.ptr + ExceptionInfoAttrs.DESTRUCTOR_OFFSET) >> 2] =
        destructor;
    };
    this.get_destructor = function () {
      return HEAP32[(this.ptr + ExceptionInfoAttrs.DESTRUCTOR_OFFSET) >> 2];
    };
    this.set_refcount = function (refcount) {
      HEAP32[(this.ptr + ExceptionInfoAttrs.REFCOUNT_OFFSET) >> 2] = refcount;
    };
    this.set_caught = function (caught) {
      caught = caught ? 1 : 0;
      HEAP8[(this.ptr + ExceptionInfoAttrs.CAUGHT_OFFSET) >> 0] = caught;
    };
    this.get_caught = function () {
      return HEAP8[(this.ptr + ExceptionInfoAttrs.CAUGHT_OFFSET) >> 0] != 0;
    };
    this.set_rethrown = function (rethrown) {
      rethrown = rethrown ? 1 : 0;
      HEAP8[(this.ptr + ExceptionInfoAttrs.RETHROWN_OFFSET) >> 0] = rethrown;
    };
    this.get_rethrown = function () {
      return HEAP8[(this.ptr + ExceptionInfoAttrs.RETHROWN_OFFSET) >> 0] != 0;
    };
    this.init = function (type, destructor) {
      this.set_type(type);
      this.set_destructor(destructor);
      this.set_refcount(0);
      this.set_caught(false);
      this.set_rethrown(false);
    };
    this.add_ref = function () {
      var value = HEAP32[(this.ptr + ExceptionInfoAttrs.REFCOUNT_OFFSET) >> 2];
      HEAP32[(this.ptr + ExceptionInfoAttrs.REFCOUNT_OFFSET) >> 2] = value + 1;
    };
    this.release_ref = function () {
      var prev = HEAP32[(this.ptr + ExceptionInfoAttrs.REFCOUNT_OFFSET) >> 2];
      HEAP32[(this.ptr + ExceptionInfoAttrs.REFCOUNT_OFFSET) >> 2] = prev - 1;
      return prev === 1;
    };
  }
  var exceptionLast = 0;
  var uncaughtExceptionCount = 0;
  function ___cxa_throw(ptr, type, destructor) {
    var info = new ExceptionInfo(ptr);
    info.init(type, destructor);
    exceptionLast = ptr;
    uncaughtExceptionCount++;
    throw ptr;
  }
  var PATH = {
    splitPath: function (filename) {
      var splitPathRe =
        /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
      return splitPathRe.exec(filename).slice(1);
    },
    normalizeArray: function (parts, allowAboveRoot) {
      var up = 0;
      for (var i = parts.length - 1; i >= 0; i--) {
        var last = parts[i];
        if (last === ".") {
          parts.splice(i, 1);
        } else if (last === "..") {
          parts.splice(i, 1);
          up++;
        } else if (up) {
          parts.splice(i, 1);
          up--;
        }
      }
      if (allowAboveRoot) {
        for (; up; up--) {
          parts.unshift("..");
        }
      }
      return parts;
    },
    normalize: function (path) {
      var isAbsolute = path.charAt(0) === "/",
        trailingSlash = path.substr(-1) === "/";
      path = PATH.normalizeArray(
        path.split("/").filter(function (p) {
          return !!p;
        }),
        !isAbsolute
      ).join("/");
      if (!path && !isAbsolute) {
        path = ".";
      }
      if (path && trailingSlash) {
        path += "/";
      }
      return (isAbsolute ? "/" : "") + path;
    },
    dirname: function (path) {
      var result = PATH.splitPath(path),
        root = result[0],
        dir = result[1];
      if (!root && !dir) {
        return ".";
      }
      if (dir) {
        dir = dir.substr(0, dir.length - 1);
      }
      return root + dir;
    },
    basename: function (path) {
      if (path === "/") return "/";
      path = PATH.normalize(path);
      path = path.replace(/\/$/, "");
      var lastSlash = path.lastIndexOf("/");
      if (lastSlash === -1) return path;
      return path.substr(lastSlash + 1);
    },
    extname: function (path) {
      return PATH.splitPath(path)[3];
    },
    join: function () {
      var paths = Array.prototype.slice.call(arguments, 0);
      return PATH.normalize(paths.join("/"));
    },
    join2: function (l, r) {
      return PATH.normalize(l + "/" + r);
    },
  };
  function getRandomDevice() {
    if (
      typeof crypto === "object" &&
      typeof crypto["getRandomValues"] === "function"
    ) {
      var randomBuffer = new Uint8Array(1);
      return function () {
        crypto.getRandomValues(randomBuffer);
        return randomBuffer[0];
      };
    } else if (ENVIRONMENT_IS_NODE) {
      try {
        var crypto_module = require("crypto");
        return function () {
          return crypto_module["randomBytes"](1)[0];
        };
      } catch (e) {}
    }
    return function () {
      abort("randomDevice");
    };
  }
  var PATH_FS = {
    resolve: function () {
      var resolvedPath = "",
        resolvedAbsolute = false;
      for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = i >= 0 ? arguments[i] : FS.cwd();
        if (typeof path !== "string") {
          throw new TypeError("Arguments to path.resolve must be strings");
        } else if (!path) {
          return "";
        }
        resolvedPath = path + "/" + resolvedPath;
        resolvedAbsolute = path.charAt(0) === "/";
      }
      resolvedPath = PATH.normalizeArray(
        resolvedPath.split("/").filter(function (p) {
          return !!p;
        }),
        !resolvedAbsolute
      ).join("/");
      return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
    },
    relative: function (from, to) {
      from = PATH_FS.resolve(from).substr(1);
      to = PATH_FS.resolve(to).substr(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== "") break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== "") break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split("/"));
      var toParts = trim(to.split("/"));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push("..");
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join("/");
    },
  };
  var TTY = {
    ttys: [],
    init: function () {},
    shutdown: function () {},
    register: function (dev, ops) {
      TTY.ttys[dev] = {
        input: [],
        output: [],
        ops: ops,
      };
      FS.registerDevice(dev, TTY.stream_ops);
    },
    stream_ops: {
      open: function (stream) {
        var tty = TTY.ttys[stream.node.rdev];
        if (!tty) {
          throw new FS.ErrnoError(43);
        }
        stream.tty = tty;
        stream.seekable = false;
      },
      close: function (stream) {
        stream.tty.ops.flush(stream.tty);
      },
      flush: function (stream) {
        stream.tty.ops.flush(stream.tty);
      },
      read: function (stream, buffer, offset, length, pos) {
        if (!stream.tty || !stream.tty.ops.get_char) {
          throw new FS.ErrnoError(60);
        }
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = stream.tty.ops.get_char(stream.tty);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: function (stream, buffer, offset, length, pos) {
        if (!stream.tty || !stream.tty.ops.put_char) {
          throw new FS.ErrnoError(60);
        }
        try {
          for (var i = 0; i < length; i++) {
            stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
          }
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      },
    },
    default_tty_ops: {
      get_char: function (tty) {
        if (!tty.input.length) {
          var result = null;
          if (ENVIRONMENT_IS_NODE) {
            var BUFSIZE = 256;
            var buf = Buffer.alloc
              ? Buffer.alloc(BUFSIZE)
              : new Buffer(BUFSIZE);
            var bytesRead = 0;
            try {
              bytesRead = nodeFS.readSync(
                process.stdin.fd,
                buf,
                0,
                BUFSIZE,
                null
              );
            } catch (e) {
              if (e.toString().includes("EOF")) bytesRead = 0;
              else throw e;
            }
            if (bytesRead > 0) {
              result = buf.slice(0, bytesRead).toString("utf-8");
            } else {
              result = null;
            }
          } else if (
            typeof window != "undefined" &&
            typeof window.prompt == "function"
          ) {
            result = window.prompt("Input: ");
            if (result !== null) {
              result += "\n";
            }
          } else if (typeof readline == "function") {
            result = readline();
            if (result !== null) {
              result += "\n";
            }
          }
          if (!result) {
            return null;
          }
          tty.input = intArrayFromString(result, true);
        }
        return tty.input.shift();
      },
      put_char: function (tty, val) {
        if (val === null || val === 10) {
          out(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val);
        }
      },
      flush: function (tty) {
        if (tty.output && tty.output.length > 0) {
          out(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      },
    },
    default_tty1_ops: {
      put_char: function (tty, val) {
        if (val === null || val === 10) {
          err(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val);
        }
      },
      flush: function (tty) {
        if (tty.output && tty.output.length > 0) {
          err(UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      },
    },
  };
  function mmapAlloc(size) {
    var alignedSize = alignMemory(size, 65536);
    var ptr = _malloc(alignedSize);
    while (size < alignedSize) HEAP8[ptr + size++] = 0;
    return ptr;
  }
  var MEMFS = {
    ops_table: null,
    mount: function (mount) {
      return MEMFS.createNode(null, "/", 16384 | 511, 0);
    },
    createNode: function (parent, name, mode, dev) {
      if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
        throw new FS.ErrnoError(63);
      }
      if (!MEMFS.ops_table) {
        MEMFS.ops_table = {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink,
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
            },
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync,
            },
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink,
            },
            stream: {},
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
            },
            stream: FS.chrdev_stream_ops,
          },
        };
      }
      var node = FS.createNode(parent, name, mode, dev);
      if (FS.isDir(node.mode)) {
        node.node_ops = MEMFS.ops_table.dir.node;
        node.stream_ops = MEMFS.ops_table.dir.stream;
        node.contents = {};
      } else if (FS.isFile(node.mode)) {
        node.node_ops = MEMFS.ops_table.file.node;
        node.stream_ops = MEMFS.ops_table.file.stream;
        node.usedBytes = 0;
        node.contents = null;
      } else if (FS.isLink(node.mode)) {
        node.node_ops = MEMFS.ops_table.link.node;
        node.stream_ops = MEMFS.ops_table.link.stream;
      } else if (FS.isChrdev(node.mode)) {
        node.node_ops = MEMFS.ops_table.chrdev.node;
        node.stream_ops = MEMFS.ops_table.chrdev.stream;
      }
      node.timestamp = Date.now();
      if (parent) {
        parent.contents[name] = node;
        parent.timestamp = node.timestamp;
      }
      return node;
    },
    getFileDataAsTypedArray: function (node) {
      if (!node.contents) return new Uint8Array(0);
      if (node.contents.subarray)
        return node.contents.subarray(0, node.usedBytes);
      return new Uint8Array(node.contents);
    },
    expandFileStorage: function (node, newCapacity) {
      var prevCapacity = node.contents ? node.contents.length : 0;
      if (prevCapacity >= newCapacity) return;
      var CAPACITY_DOUBLING_MAX = 1024 * 1024;
      newCapacity = Math.max(
        newCapacity,
        (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>>
          0
      );
      if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
      var oldContents = node.contents;
      node.contents = new Uint8Array(newCapacity);
      if (node.usedBytes > 0)
        node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
    },
    resizeFileStorage: function (node, newSize) {
      if (node.usedBytes == newSize) return;
      if (newSize == 0) {
        node.contents = null;
        node.usedBytes = 0;
      } else {
        var oldContents = node.contents;
        node.contents = new Uint8Array(newSize);
        if (oldContents) {
          node.contents.set(
            oldContents.subarray(0, Math.min(newSize, node.usedBytes))
          );
        }
        node.usedBytes = newSize;
      }
    },
    node_ops: {
      getattr: function (node) {
        var attr = {};
        attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
        attr.ino = node.id;
        attr.mode = node.mode;
        attr.nlink = 1;
        attr.uid = 0;
        attr.gid = 0;
        attr.rdev = node.rdev;
        if (FS.isDir(node.mode)) {
          attr.size = 4096;
        } else if (FS.isFile(node.mode)) {
          attr.size = node.usedBytes;
        } else if (FS.isLink(node.mode)) {
          attr.size = node.link.length;
        } else {
          attr.size = 0;
        }
        attr.atime = new Date(node.timestamp);
        attr.mtime = new Date(node.timestamp);
        attr.ctime = new Date(node.timestamp);
        attr.blksize = 4096;
        attr.blocks = Math.ceil(attr.size / attr.blksize);
        return attr;
      },
      setattr: function (node, attr) {
        if (attr.mode !== undefined) {
          node.mode = attr.mode;
        }
        if (attr.timestamp !== undefined) {
          node.timestamp = attr.timestamp;
        }
        if (attr.size !== undefined) {
          MEMFS.resizeFileStorage(node, attr.size);
        }
      },
      lookup: function (parent, name) {
        throw FS.genericErrors[44];
      },
      mknod: function (parent, name, mode, dev) {
        return MEMFS.createNode(parent, name, mode, dev);
      },
      rename: function (old_node, new_dir, new_name) {
        if (FS.isDir(old_node.mode)) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (new_node) {
            for (var i in new_node.contents) {
              throw new FS.ErrnoError(55);
            }
          }
        }
        delete old_node.parent.contents[old_node.name];
        old_node.parent.timestamp = Date.now();
        old_node.name = new_name;
        new_dir.contents[new_name] = old_node;
        new_dir.timestamp = old_node.parent.timestamp;
        old_node.parent = new_dir;
      },
      unlink: function (parent, name) {
        delete parent.contents[name];
        parent.timestamp = Date.now();
      },
      rmdir: function (parent, name) {
        var node = FS.lookupNode(parent, name);
        for (var i in node.contents) {
          throw new FS.ErrnoError(55);
        }
        delete parent.contents[name];
        parent.timestamp = Date.now();
      },
      readdir: function (node) {
        var entries = [".", ".."];
        for (var key in node.contents) {
          if (!node.contents.hasOwnProperty(key)) {
            continue;
          }
          entries.push(key);
        }
        return entries;
      },
      symlink: function (parent, newname, oldpath) {
        var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
        node.link = oldpath;
        return node;
      },
      readlink: function (node) {
        if (!FS.isLink(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        return node.link;
      },
    },
    stream_ops: {
      read: function (stream, buffer, offset, length, position) {
        var contents = stream.node.contents;
        if (position >= stream.node.usedBytes) return 0;
        var size = Math.min(stream.node.usedBytes - position, length);
        if (size > 8 && contents.subarray) {
          buffer.set(contents.subarray(position, position + size), offset);
        } else {
          for (var i = 0; i < size; i++)
            buffer[offset + i] = contents[position + i];
        }
        return size;
      },
      write: function (stream, buffer, offset, length, position, canOwn) {
        if (buffer.buffer === HEAP8.buffer) {
          canOwn = false;
        }
        if (!length) return 0;
        var node = stream.node;
        node.timestamp = Date.now();
        if (buffer.subarray && (!node.contents || node.contents.subarray)) {
          if (canOwn) {
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
            return length;
          } else if (node.usedBytes === 0 && position === 0) {
            node.contents = buffer.slice(offset, offset + length);
            node.usedBytes = length;
            return length;
          } else if (position + length <= node.usedBytes) {
            node.contents.set(
              buffer.subarray(offset, offset + length),
              position
            );
            return length;
          }
        }
        MEMFS.expandFileStorage(node, position + length);
        if (node.contents.subarray && buffer.subarray) {
          node.contents.set(buffer.subarray(offset, offset + length), position);
        } else {
          for (var i = 0; i < length; i++) {
            node.contents[position + i] = buffer[offset + i];
          }
        }
        node.usedBytes = Math.max(node.usedBytes, position + length);
        return length;
      },
      llseek: function (stream, offset, whence) {
        var position = offset;
        if (whence === 1) {
          position += stream.position;
        } else if (whence === 2) {
          if (FS.isFile(stream.node.mode)) {
            position += stream.node.usedBytes;
          }
        }
        if (position < 0) {
          throw new FS.ErrnoError(28);
        }
        return position;
      },
      allocate: function (stream, offset, length) {
        MEMFS.expandFileStorage(stream.node, offset + length);
        stream.node.usedBytes = Math.max(
          stream.node.usedBytes,
          offset + length
        );
      },
      mmap: function (stream, address, length, position, prot, flags) {
        if (address !== 0) {
          throw new FS.ErrnoError(28);
        }
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        var ptr;
        var allocated;
        var contents = stream.node.contents;
        if (!(flags & 2) && contents.buffer === buffer) {
          allocated = false;
          ptr = contents.byteOffset;
        } else {
          if (position > 0 || position + length < contents.length) {
            if (contents.subarray) {
              contents = contents.subarray(position, position + length);
            } else {
              contents = Array.prototype.slice.call(
                contents,
                position,
                position + length
              );
            }
          }
          allocated = true;
          ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          HEAP8.set(contents, ptr);
        }
        return {
          ptr: ptr,
          allocated: allocated,
        };
      },
      msync: function (stream, buffer, offset, length, mmapFlags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (mmapFlags & 2) {
          return 0;
        }
        var bytesWritten = MEMFS.stream_ops.write(
          stream,
          buffer,
          0,
          length,
          offset,
          false
        );
        return 0;
      },
    },
  };
  var IDBFS = {
    dbs: {},
    indexedDB: function () {
      if (typeof indexedDB !== "undefined") return indexedDB;
      var ret = null;
      if (typeof window === "object")
        ret =
          window.indexedDB ||
          window.mozIndexedDB ||
          window.webkitIndexedDB ||
          window.msIndexedDB;
      assert(ret, "IDBFS used, but indexedDB not supported");
      return ret;
    },
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    mount: function (mount) {
      return MEMFS.mount.apply(null, arguments);
    },
    syncfs: function (mount, populate, callback) {
      IDBFS.getLocalSet(mount, function (err, local) {
        if (err) return callback(err);
        IDBFS.getRemoteSet(mount, function (err, remote) {
          if (err) return callback(err);
          var src = populate ? remote : local;
          var dst = populate ? local : remote;
          IDBFS.reconcile(src, dst, callback);
        });
      });
    },
    getDB: function (name, callback) {
      var db = IDBFS.dbs[name];
      if (db) {
        return callback(null, db);
      }
      var req;
      try {
        req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
      } catch (e) {
        return callback(e);
      }
      if (!req) {
        return callback("Unable to connect to IndexedDB");
      }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        var transaction = e.target.transaction;
        var fileStore;
        if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
          fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
        } else {
          fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
        }
        if (!fileStore.indexNames.contains("timestamp")) {
          fileStore.createIndex("timestamp", "timestamp", {
            unique: false,
          });
        }
      };
      req.onsuccess = function () {
        db = req.result;
        IDBFS.dbs[name] = db;
        callback(null, db);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    getLocalSet: function (mount, callback) {
      var entries = {};
      function isRealDir(p) {
        return p !== "." && p !== "..";
      }
      function toAbsolute(root) {
        return function (p) {
          return PATH.join2(root, p);
        };
      }
      var check = FS.readdir(mount.mountpoint)
        .filter(isRealDir)
        .map(toAbsolute(mount.mountpoint));
      while (check.length) {
        var path = check.pop();
        var stat;
        try {
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
        if (FS.isDir(stat.mode)) {
          check.push.apply(
            check,
            FS.readdir(path).filter(isRealDir).map(toAbsolute(path))
          );
        }
        entries[path] = {
          timestamp: stat.mtime,
        };
      }
      return callback(null, {
        type: "local",
        entries: entries,
      });
    },
    getRemoteSet: function (mount, callback) {
      var entries = {};
      IDBFS.getDB(mount.mountpoint, function (err, db) {
        if (err) return callback(err);
        try {
          var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
          transaction.onerror = function (e) {
            callback(this.error);
            e.preventDefault();
          };
          var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
          var index = store.index("timestamp");
          index.openKeyCursor().onsuccess = function (event) {
            var cursor = event.target.result;
            if (!cursor) {
              return callback(null, {
                type: "remote",
                db: db,
                entries: entries,
              });
            }
            entries[cursor.primaryKey] = {
              timestamp: cursor.key,
            };
            cursor.continue();
          };
        } catch (e) {
          return callback(e);
        }
      });
    },
    loadLocalEntry: function (path, callback) {
      var stat, node;
      try {
        var lookup = FS.lookupPath(path);
        node = lookup.node;
        stat = FS.stat(path);
      } catch (e) {
        return callback(e);
      }
      if (FS.isDir(stat.mode)) {
        return callback(null, {
          timestamp: stat.mtime,
          mode: stat.mode,
        });
      } else if (FS.isFile(stat.mode)) {
        node.contents = MEMFS.getFileDataAsTypedArray(node);
        return callback(null, {
          timestamp: stat.mtime,
          mode: stat.mode,
          contents: node.contents,
        });
      } else {
        return callback(new Error("node type not supported"));
      }
    },
    storeLocalEntry: function (path, entry, callback) {
      try {
        if (FS.isDir(entry["mode"])) {
          FS.mkdirTree(path, entry["mode"]);
        } else if (FS.isFile(entry["mode"])) {
          FS.writeFile(path, entry["contents"], {
            canOwn: true,
          });
        } else {
          return callback(new Error("node type not supported"));
        }
        FS.chmod(path, entry["mode"]);
        FS.utime(path, entry["timestamp"], entry["timestamp"]);
      } catch (e) {
        return callback(e);
      }
      callback(null);
    },
    removeLocalEntry: function (path, callback) {
      try {
        var lookup = FS.lookupPath(path);
        var stat = FS.stat(path);
        if (FS.isDir(stat.mode)) {
          FS.rmdir(path);
        } else if (FS.isFile(stat.mode)) {
          FS.unlink(path);
        }
      } catch (e) {
        return callback(e);
      }
      callback(null);
    },
    loadRemoteEntry: function (store, path, callback) {
      var req = store.get(path);
      req.onsuccess = function (event) {
        callback(null, event.target.result);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    storeRemoteEntry: function (store, path, entry, callback) {
      try {
        var req = store.put(entry, path);
      } catch (e) {
        callback(e);
        return;
      }
      req.onsuccess = function () {
        callback(null);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    removeRemoteEntry: function (store, path, callback) {
      var req = store.delete(path);
      req.onsuccess = function () {
        callback(null);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    reconcile: function (src, dst, callback) {
      var total = 0;
      var create = [];
      Object.keys(src.entries).forEach(function (key) {
        var e = src.entries[key];
        var e2 = dst.entries[key];
        if (!e2 || e["timestamp"].getTime() != e2["timestamp"].getTime()) {
          create.push(key);
          total++;
        }
      });
      var remove = [];
      Object.keys(dst.entries).forEach(function (key) {
        if (!src.entries[key]) {
          remove.push(key);
          total++;
        }
      });
      if (!total) {
        return callback(null);
      }
      var errored = false;
      var db = src.type === "remote" ? src.db : dst.db;
      var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
      var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
      function done(err) {
        if (err && !errored) {
          errored = true;
          return callback(err);
        }
      }
      transaction.onerror = function (e) {
        done(this.error);
        e.preventDefault();
      };
      transaction.oncomplete = function (e) {
        if (!errored) {
          callback(null);
        }
      };
      create.sort().forEach(function (path) {
        if (dst.type === "local") {
          IDBFS.loadRemoteEntry(store, path, function (err, entry) {
            if (err) return done(err);
            IDBFS.storeLocalEntry(path, entry, done);
          });
        } else {
          IDBFS.loadLocalEntry(path, function (err, entry) {
            if (err) return done(err);
            IDBFS.storeRemoteEntry(store, path, entry, done);
          });
        }
      });
      remove
        .sort()
        .reverse()
        .forEach(function (path) {
          if (dst.type === "local") {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
    },
  };
  var FS = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: {
      openFlags: {
        READ: 1,
        WRITE: 2,
      },
    },
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    lookupPath: function (path, opts) {
      path = PATH_FS.resolve(FS.cwd(), path);
      opts = opts || {};
      if (!path)
        return {
          path: "",
          node: null,
        };
      var defaults = {
        follow_mount: true,
        recurse_count: 0,
      };
      for (var key in defaults) {
        if (opts[key] === undefined) {
          opts[key] = defaults[key];
        }
      }
      if (opts.recurse_count > 8) {
        throw new FS.ErrnoError(32);
      }
      var parts = PATH.normalizeArray(
        path.split("/").filter(function (p) {
          return !!p;
        }),
        false
      );
      var current = FS.root;
      var current_path = "/";
      for (var i = 0; i < parts.length; i++) {
        var islast = i === parts.length - 1;
        if (islast && opts.parent) {
          break;
        }
        current = FS.lookupNode(current, parts[i]);
        current_path = PATH.join2(current_path, parts[i]);
        if (FS.isMountpoint(current)) {
          if (!islast || (islast && opts.follow_mount)) {
            current = current.mounted.root;
          }
        }
        if (!islast || opts.follow) {
          var count = 0;
          while (FS.isLink(current.mode)) {
            var link = FS.readlink(current_path);
            current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
            var lookup = FS.lookupPath(current_path, {
              recurse_count: opts.recurse_count,
            });
            current = lookup.node;
            if (count++ > 40) {
              throw new FS.ErrnoError(32);
            }
          }
        }
      }
      return {
        path: current_path,
        node: current,
      };
    },
    getPath: function (node) {
      var path;
      while (true) {
        if (FS.isRoot(node)) {
          var mount = node.mount.mountpoint;
          if (!path) return mount;
          return mount[mount.length - 1] !== "/"
            ? mount + "/" + path
            : mount + path;
        }
        path = path ? node.name + "/" + path : node.name;
        node = node.parent;
      }
    },
    hashName: function (parentid, name) {
      var hash = 0;
      for (var i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
      }
      return ((parentid + hash) >>> 0) % FS.nameTable.length;
    },
    hashAddNode: function (node) {
      var hash = FS.hashName(node.parent.id, node.name);
      node.name_next = FS.nameTable[hash];
      FS.nameTable[hash] = node;
    },
    hashRemoveNode: function (node) {
      var hash = FS.hashName(node.parent.id, node.name);
      if (FS.nameTable[hash] === node) {
        FS.nameTable[hash] = node.name_next;
      } else {
        var current = FS.nameTable[hash];
        while (current) {
          if (current.name_next === node) {
            current.name_next = node.name_next;
            break;
          }
          current = current.name_next;
        }
      }
    },
    lookupNode: function (parent, name) {
      var errCode = FS.mayLookup(parent);
      if (errCode) {
        throw new FS.ErrnoError(errCode, parent);
      }
      var hash = FS.hashName(parent.id, name);
      for (var node = FS.nameTable[hash]; node; node = node.name_next) {
        var nodeName = node.name;
        if (node.parent.id === parent.id && nodeName === name) {
          return node;
        }
      }
      return FS.lookup(parent, name);
    },
    createNode: function (parent, name, mode, rdev) {
      var node = new FS.FSNode(parent, name, mode, rdev);
      FS.hashAddNode(node);
      return node;
    },
    destroyNode: function (node) {
      FS.hashRemoveNode(node);
    },
    isRoot: function (node) {
      return node === node.parent;
    },
    isMountpoint: function (node) {
      return !!node.mounted;
    },
    isFile: function (mode) {
      return (mode & 61440) === 32768;
    },
    isDir: function (mode) {
      return (mode & 61440) === 16384;
    },
    isLink: function (mode) {
      return (mode & 61440) === 40960;
    },
    isChrdev: function (mode) {
      return (mode & 61440) === 8192;
    },
    isBlkdev: function (mode) {
      return (mode & 61440) === 24576;
    },
    isFIFO: function (mode) {
      return (mode & 61440) === 4096;
    },
    isSocket: function (mode) {
      return (mode & 49152) === 49152;
    },
    flagModes: {
      r: 0,
      "r+": 2,
      w: 577,
      "w+": 578,
      a: 1089,
      "a+": 1090,
    },
    modeStringToFlags: function (str) {
      var flags = FS.flagModes[str];
      if (typeof flags === "undefined") {
        throw new Error("Unknown file open mode: " + str);
      }
      return flags;
    },
    flagsToPermissionString: function (flag) {
      var perms = ["r", "w", "rw"][flag & 3];
      if (flag & 512) {
        perms += "w";
      }
      return perms;
    },
    nodePermissions: function (node, perms) {
      if (FS.ignorePermissions) {
        return 0;
      }
      if (perms.includes("r") && !(node.mode & 292)) {
        return 2;
      } else if (perms.includes("w") && !(node.mode & 146)) {
        return 2;
      } else if (perms.includes("x") && !(node.mode & 73)) {
        return 2;
      }
      return 0;
    },
    mayLookup: function (dir) {
      var errCode = FS.nodePermissions(dir, "x");
      if (errCode) return errCode;
      if (!dir.node_ops.lookup) return 2;
      return 0;
    },
    mayCreate: function (dir, name) {
      try {
        var node = FS.lookupNode(dir, name);
        return 20;
      } catch (e) {}
      return FS.nodePermissions(dir, "wx");
    },
    mayDelete: function (dir, name, isdir) {
      var node;
      try {
        node = FS.lookupNode(dir, name);
      } catch (e) {
        return e.errno;
      }
      var errCode = FS.nodePermissions(dir, "wx");
      if (errCode) {
        return errCode;
      }
      if (isdir) {
        if (!FS.isDir(node.mode)) {
          return 54;
        }
        if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
          return 10;
        }
      } else {
        if (FS.isDir(node.mode)) {
          return 31;
        }
      }
      return 0;
    },
    mayOpen: function (node, flags) {
      if (!node) {
        return 44;
      }
      if (FS.isLink(node.mode)) {
        return 32;
      } else if (FS.isDir(node.mode)) {
        if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
          return 31;
        }
      }
      return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function (fd_start, fd_end) {
      fd_start = fd_start || 0;
      fd_end = fd_end || FS.MAX_OPEN_FDS;
      for (var fd = fd_start; fd <= fd_end; fd++) {
        if (!FS.streams[fd]) {
          return fd;
        }
      }
      throw new FS.ErrnoError(33);
    },
    getStream: function (fd) {
      return FS.streams[fd];
    },
    createStream: function (stream, fd_start, fd_end) {
      if (!FS.FSStream) {
        FS.FSStream = function () {};
        FS.FSStream.prototype = {
          object: {
            get: function () {
              return this.node;
            },
            set: function (val) {
              this.node = val;
            },
          },
          isRead: {
            get: function () {
              return (this.flags & 2097155) !== 1;
            },
          },
          isWrite: {
            get: function () {
              return (this.flags & 2097155) !== 0;
            },
          },
          isAppend: {
            get: function () {
              return this.flags & 1024;
            },
          },
        };
      }
      var newStream = new FS.FSStream();
      for (var p in stream) {
        newStream[p] = stream[p];
      }
      stream = newStream;
      var fd = FS.nextfd(fd_start, fd_end);
      stream.fd = fd;
      FS.streams[fd] = stream;
      return stream;
    },
    closeStream: function (fd) {
      FS.streams[fd] = null;
    },
    chrdev_stream_ops: {
      open: function (stream) {
        var device = FS.getDevice(stream.node.rdev);
        stream.stream_ops = device.stream_ops;
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
      },
      llseek: function () {
        throw new FS.ErrnoError(70);
      },
    },
    major: function (dev) {
      return dev >> 8;
    },
    minor: function (dev) {
      return dev & 255;
    },
    makedev: function (ma, mi) {
      return (ma << 8) | mi;
    },
    registerDevice: function (dev, ops) {
      FS.devices[dev] = {
        stream_ops: ops,
      };
    },
    getDevice: function (dev) {
      return FS.devices[dev];
    },
    getMounts: function (mount) {
      var mounts = [];
      var check = [mount];
      while (check.length) {
        var m = check.pop();
        mounts.push(m);
        check.push.apply(check, m.mounts);
      }
      return mounts;
    },
    syncfs: function (populate, callback) {
      if (typeof populate === "function") {
        callback = populate;
        populate = false;
      }
      FS.syncFSRequests++;
      if (FS.syncFSRequests > 1) {
        err(
          "warning: " +
            FS.syncFSRequests +
            " FS.syncfs operations in flight at once, probably just doing extra work"
        );
      }
      var mounts = FS.getMounts(FS.root.mount);
      var completed = 0;
      function doCallback(errCode) {
        FS.syncFSRequests--;
        return callback(errCode);
      }
      function done(errCode) {
        if (errCode) {
          if (!done.errored) {
            done.errored = true;
            return doCallback(errCode);
          }
          return;
        }
        if (++completed >= mounts.length) {
          doCallback(null);
        }
      }
      mounts.forEach(function (mount) {
        if (!mount.type.syncfs) {
          return done(null);
        }
        mount.type.syncfs(mount, populate, done);
      });
    },
    mount: function (type, opts, mountpoint) {
      var root = mountpoint === "/";
      var pseudo = !mountpoint;
      var node;
      if (root && FS.root) {
        throw new FS.ErrnoError(10);
      } else if (!root && !pseudo) {
        var lookup = FS.lookupPath(mountpoint, {
          follow_mount: false,
        });
        mountpoint = lookup.path;
        node = lookup.node;
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        if (!FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
      }
      var mount = {
        type: type,
        opts: opts,
        mountpoint: mountpoint,
        mounts: [],
      };
      var mountRoot = type.mount(mount);
      mountRoot.mount = mount;
      mount.root = mountRoot;
      if (root) {
        FS.root = mountRoot;
      } else if (node) {
        node.mounted = mount;
        if (node.mount) {
          node.mount.mounts.push(mount);
        }
      }
      return mountRoot;
    },
    unmount: function (mountpoint) {
      var lookup = FS.lookupPath(mountpoint, {
        follow_mount: false,
      });
      if (!FS.isMountpoint(lookup.node)) {
        throw new FS.ErrnoError(28);
      }
      var node = lookup.node;
      var mount = node.mounted;
      var mounts = FS.getMounts(mount);
      Object.keys(FS.nameTable).forEach(function (hash) {
        var current = FS.nameTable[hash];
        while (current) {
          var next = current.name_next;
          if (mounts.includes(current.mount)) {
            FS.destroyNode(current);
          }
          current = next;
        }
      });
      node.mounted = null;
      var idx = node.mount.mounts.indexOf(mount);
      node.mount.mounts.splice(idx, 1);
    },
    lookup: function (parent, name) {
      return parent.node_ops.lookup(parent, name);
    },
    mknod: function (path, mode, dev) {
      var lookup = FS.lookupPath(path, {
        parent: true,
      });
      var parent = lookup.node;
      var name = PATH.basename(path);
      if (!name || name === "." || name === "..") {
        throw new FS.ErrnoError(28);
      }
      var errCode = FS.mayCreate(parent, name);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      if (!parent.node_ops.mknod) {
        throw new FS.ErrnoError(63);
      }
      return parent.node_ops.mknod(parent, name, mode, dev);
    },
    create: function (path, mode) {
      mode = mode !== undefined ? mode : 438;
      mode &= 4095;
      mode |= 32768;
      return FS.mknod(path, mode, 0);
    },
    mkdir: function (path, mode) {
      mode = mode !== undefined ? mode : 511;
      mode &= 511 | 512;
      mode |= 16384;
      return FS.mknod(path, mode, 0);
    },
    mkdirTree: function (path, mode) {
      var dirs = path.split("/");
      var d = "";
      for (var i = 0; i < dirs.length; ++i) {
        if (!dirs[i]) continue;
        d += "/" + dirs[i];
        try {
          FS.mkdir(d, mode);
        } catch (e) {
          if (e.errno != 20) throw e;
        }
      }
    },
    mkdev: function (path, mode, dev) {
      if (typeof dev === "undefined") {
        dev = mode;
        mode = 438;
      }
      mode |= 8192;
      return FS.mknod(path, mode, dev);
    },
    symlink: function (oldpath, newpath) {
      if (!PATH_FS.resolve(oldpath)) {
        throw new FS.ErrnoError(44);
      }
      var lookup = FS.lookupPath(newpath, {
        parent: true,
      });
      var parent = lookup.node;
      if (!parent) {
        throw new FS.ErrnoError(44);
      }
      var newname = PATH.basename(newpath);
      var errCode = FS.mayCreate(parent, newname);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      if (!parent.node_ops.symlink) {
        throw new FS.ErrnoError(63);
      }
      return parent.node_ops.symlink(parent, newname, oldpath);
    },
    rename: function (old_path, new_path) {
      var old_dirname = PATH.dirname(old_path);
      var new_dirname = PATH.dirname(new_path);
      var old_name = PATH.basename(old_path);
      var new_name = PATH.basename(new_path);
      var lookup, old_dir, new_dir;
      lookup = FS.lookupPath(old_path, {
        parent: true,
      });
      old_dir = lookup.node;
      lookup = FS.lookupPath(new_path, {
        parent: true,
      });
      new_dir = lookup.node;
      if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
      if (old_dir.mount !== new_dir.mount) {
        throw new FS.ErrnoError(75);
      }
      var old_node = FS.lookupNode(old_dir, old_name);
      var relative = PATH_FS.relative(old_path, new_dirname);
      if (relative.charAt(0) !== ".") {
        throw new FS.ErrnoError(28);
      }
      relative = PATH_FS.relative(new_path, old_dirname);
      if (relative.charAt(0) !== ".") {
        throw new FS.ErrnoError(55);
      }
      var new_node;
      try {
        new_node = FS.lookupNode(new_dir, new_name);
      } catch (e) {}
      if (old_node === new_node) {
        return;
      }
      var isdir = FS.isDir(old_node.mode);
      var errCode = FS.mayDelete(old_dir, old_name, isdir);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      errCode = new_node
        ? FS.mayDelete(new_dir, new_name, isdir)
        : FS.mayCreate(new_dir, new_name);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      if (!old_dir.node_ops.rename) {
        throw new FS.ErrnoError(63);
      }
      if (
        FS.isMountpoint(old_node) ||
        (new_node && FS.isMountpoint(new_node))
      ) {
        throw new FS.ErrnoError(10);
      }
      if (new_dir !== old_dir) {
        errCode = FS.nodePermissions(old_dir, "w");
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
      }
      try {
        if (FS.trackingDelegate["willMovePath"]) {
          FS.trackingDelegate["willMovePath"](old_path, new_path);
        }
      } catch (e) {
        err(
          "FS.trackingDelegate['willMovePath']('" +
            old_path +
            "', '" +
            new_path +
            "') threw an exception: " +
            e.message
        );
      }
      FS.hashRemoveNode(old_node);
      try {
        old_dir.node_ops.rename(old_node, new_dir, new_name);
      } catch (e) {
        throw e;
      } finally {
        FS.hashAddNode(old_node);
      }
      try {
        if (FS.trackingDelegate["onMovePath"])
          FS.trackingDelegate["onMovePath"](old_path, new_path);
      } catch (e) {
        err(
          "FS.trackingDelegate['onMovePath']('" +
            old_path +
            "', '" +
            new_path +
            "') threw an exception: " +
            e.message
        );
      }
    },
    rmdir: function (path) {
      var lookup = FS.lookupPath(path, {
        parent: true,
      });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var errCode = FS.mayDelete(parent, name, true);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      if (!parent.node_ops.rmdir) {
        throw new FS.ErrnoError(63);
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      try {
        if (FS.trackingDelegate["willDeletePath"]) {
          FS.trackingDelegate["willDeletePath"](path);
        }
      } catch (e) {
        err(
          "FS.trackingDelegate['willDeletePath']('" +
            path +
            "') threw an exception: " +
            e.message
        );
      }
      parent.node_ops.rmdir(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate["onDeletePath"])
          FS.trackingDelegate["onDeletePath"](path);
      } catch (e) {
        err(
          "FS.trackingDelegate['onDeletePath']('" +
            path +
            "') threw an exception: " +
            e.message
        );
      }
    },
    readdir: function (path) {
      var lookup = FS.lookupPath(path, {
        follow: true,
      });
      var node = lookup.node;
      if (!node.node_ops.readdir) {
        throw new FS.ErrnoError(54);
      }
      return node.node_ops.readdir(node);
    },
    unlink: function (path) {
      var lookup = FS.lookupPath(path, {
        parent: true,
      });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var errCode = FS.mayDelete(parent, name, false);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      if (!parent.node_ops.unlink) {
        throw new FS.ErrnoError(63);
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      try {
        if (FS.trackingDelegate["willDeletePath"]) {
          FS.trackingDelegate["willDeletePath"](path);
        }
      } catch (e) {
        err(
          "FS.trackingDelegate['willDeletePath']('" +
            path +
            "') threw an exception: " +
            e.message
        );
      }
      parent.node_ops.unlink(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate["onDeletePath"])
          FS.trackingDelegate["onDeletePath"](path);
      } catch (e) {
        err(
          "FS.trackingDelegate['onDeletePath']('" +
            path +
            "') threw an exception: " +
            e.message
        );
      }
    },
    readlink: function (path) {
      var lookup = FS.lookupPath(path);
      var link = lookup.node;
      if (!link) {
        throw new FS.ErrnoError(44);
      }
      if (!link.node_ops.readlink) {
        throw new FS.ErrnoError(28);
      }
      return PATH_FS.resolve(
        FS.getPath(link.parent),
        link.node_ops.readlink(link)
      );
    },
    stat: function (path, dontFollow) {
      var lookup = FS.lookupPath(path, {
        follow: !dontFollow,
      });
      var node = lookup.node;
      if (!node) {
        throw new FS.ErrnoError(44);
      }
      if (!node.node_ops.getattr) {
        throw new FS.ErrnoError(63);
      }
      return node.node_ops.getattr(node);
    },
    lstat: function (path) {
      return FS.stat(path, true);
    },
    chmod: function (path, mode, dontFollow) {
      var node;
      if (typeof path === "string") {
        var lookup = FS.lookupPath(path, {
          follow: !dontFollow,
        });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(63);
      }
      node.node_ops.setattr(node, {
        mode: (mode & 4095) | (node.mode & ~4095),
        timestamp: Date.now(),
      });
    },
    lchmod: function (path, mode) {
      FS.chmod(path, mode, true);
    },
    fchmod: function (fd, mode) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(8);
      }
      FS.chmod(stream.node, mode);
    },
    chown: function (path, uid, gid, dontFollow) {
      var node;
      if (typeof path === "string") {
        var lookup = FS.lookupPath(path, {
          follow: !dontFollow,
        });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(63);
      }
      node.node_ops.setattr(node, {
        timestamp: Date.now(),
      });
    },
    lchown: function (path, uid, gid) {
      FS.chown(path, uid, gid, true);
    },
    fchown: function (fd, uid, gid) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(8);
      }
      FS.chown(stream.node, uid, gid);
    },
    truncate: function (path, len) {
      if (len < 0) {
        throw new FS.ErrnoError(28);
      }
      var node;
      if (typeof path === "string") {
        var lookup = FS.lookupPath(path, {
          follow: true,
        });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(63);
      }
      if (FS.isDir(node.mode)) {
        throw new FS.ErrnoError(31);
      }
      if (!FS.isFile(node.mode)) {
        throw new FS.ErrnoError(28);
      }
      var errCode = FS.nodePermissions(node, "w");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      node.node_ops.setattr(node, {
        size: len,
        timestamp: Date.now(),
      });
    },
    ftruncate: function (fd, len) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(8);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(28);
      }
      FS.truncate(stream.node, len);
    },
    utime: function (path, atime, mtime) {
      var lookup = FS.lookupPath(path, {
        follow: true,
      });
      var node = lookup.node;
      node.node_ops.setattr(node, {
        timestamp: Math.max(atime, mtime),
      });
    },
    open: function (path, flags, mode, fd_start, fd_end) {
      if (path === "") {
        throw new FS.ErrnoError(44);
      }
      flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
      mode = typeof mode === "undefined" ? 438 : mode;
      if (flags & 64) {
        mode = (mode & 4095) | 32768;
      } else {
        mode = 0;
      }
      var node;
      if (typeof path === "object") {
        node = path;
      } else {
        path = PATH.normalize(path);
        try {
          var lookup = FS.lookupPath(path, {
            follow: !(flags & 131072),
          });
          node = lookup.node;
        } catch (e) {}
      }
      var created = false;
      if (flags & 64) {
        if (node) {
          if (flags & 128) {
            throw new FS.ErrnoError(20);
          }
        } else {
          node = FS.mknod(path, mode, 0);
          created = true;
        }
      }
      if (!node) {
        throw new FS.ErrnoError(44);
      }
      if (FS.isChrdev(node.mode)) {
        flags &= ~512;
      }
      if (flags & 65536 && !FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
      if (!created) {
        var errCode = FS.mayOpen(node, flags);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
      }
      if (flags & 512) {
        FS.truncate(node, 0);
      }
      flags &= ~(128 | 512 | 131072);
      var stream = FS.createStream(
        {
          node: node,
          path: FS.getPath(node),
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          ungotten: [],
          error: false,
        },
        fd_start,
        fd_end
      );
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
      if (Module["logReadFiles"] && !(flags & 1)) {
        if (!FS.readFiles) FS.readFiles = {};
        if (!(path in FS.readFiles)) {
          FS.readFiles[path] = 1;
          err("FS.trackingDelegate error on read file: " + path);
        }
      }
      try {
        if (FS.trackingDelegate["onOpenFile"]) {
          var trackingFlags = 0;
          if ((flags & 2097155) !== 1) {
            trackingFlags |= FS.tracking.openFlags.READ;
          }
          if ((flags & 2097155) !== 0) {
            trackingFlags |= FS.tracking.openFlags.WRITE;
          }
          FS.trackingDelegate["onOpenFile"](path, trackingFlags);
        }
      } catch (e) {
        err(
          "FS.trackingDelegate['onOpenFile']('" +
            path +
            "', flags) threw an exception: " +
            e.message
        );
      }
      return stream;
    },
    close: function (stream) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(8);
      }
      if (stream.getdents) stream.getdents = null;
      try {
        if (stream.stream_ops.close) {
          stream.stream_ops.close(stream);
        }
      } catch (e) {
        throw e;
      } finally {
        FS.closeStream(stream.fd);
      }
      stream.fd = null;
    },
    isClosed: function (stream) {
      return stream.fd === null;
    },
    llseek: function (stream, offset, whence) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(8);
      }
      if (!stream.seekable || !stream.stream_ops.llseek) {
        throw new FS.ErrnoError(70);
      }
      if (whence != 0 && whence != 1 && whence != 2) {
        throw new FS.ErrnoError(28);
      }
      stream.position = stream.stream_ops.llseek(stream, offset, whence);
      stream.ungotten = [];
      return stream.position;
    },
    read: function (stream, buffer, offset, length, position) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(28);
      }
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(8);
      }
      if ((stream.flags & 2097155) === 1) {
        throw new FS.ErrnoError(8);
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(31);
      }
      if (!stream.stream_ops.read) {
        throw new FS.ErrnoError(28);
      }
      var seeking = typeof position !== "undefined";
      if (!seeking) {
        position = stream.position;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(70);
      }
      var bytesRead = stream.stream_ops.read(
        stream,
        buffer,
        offset,
        length,
        position
      );
      if (!seeking) stream.position += bytesRead;
      return bytesRead;
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(28);
      }
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(8);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(8);
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(31);
      }
      if (!stream.stream_ops.write) {
        throw new FS.ErrnoError(28);
      }
      if (stream.seekable && stream.flags & 1024) {
        FS.llseek(stream, 0, 2);
      }
      var seeking = typeof position !== "undefined";
      if (!seeking) {
        position = stream.position;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(70);
      }
      var bytesWritten = stream.stream_ops.write(
        stream,
        buffer,
        offset,
        length,
        position,
        canOwn
      );
      if (!seeking) stream.position += bytesWritten;
      try {
        if (stream.path && FS.trackingDelegate["onWriteToFile"])
          FS.trackingDelegate["onWriteToFile"](stream.path);
      } catch (e) {
        err(
          "FS.trackingDelegate['onWriteToFile']('" +
            stream.path +
            "') threw an exception: " +
            e.message
        );
      }
      return bytesWritten;
    },
    allocate: function (stream, offset, length) {
      if (FS.isClosed(stream)) {
        throw new FS.ErrnoError(8);
      }
      if (offset < 0 || length <= 0) {
        throw new FS.ErrnoError(28);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(8);
      }
      if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      if (!stream.stream_ops.allocate) {
        throw new FS.ErrnoError(138);
      }
      stream.stream_ops.allocate(stream, offset, length);
    },
    mmap: function (stream, address, length, position, prot, flags) {
      if (
        (prot & 2) !== 0 &&
        (flags & 2) === 0 &&
        (stream.flags & 2097155) !== 2
      ) {
        throw new FS.ErrnoError(2);
      }
      if ((stream.flags & 2097155) === 1) {
        throw new FS.ErrnoError(2);
      }
      if (!stream.stream_ops.mmap) {
        throw new FS.ErrnoError(43);
      }
      return stream.stream_ops.mmap(
        stream,
        address,
        length,
        position,
        prot,
        flags
      );
    },
    msync: function (stream, buffer, offset, length, mmapFlags) {
      if (!stream || !stream.stream_ops.msync) {
        return 0;
      }
      return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
    },
    munmap: function (stream) {
      return 0;
    },
    ioctl: function (stream, cmd, arg) {
      if (!stream.stream_ops.ioctl) {
        throw new FS.ErrnoError(59);
      }
      return stream.stream_ops.ioctl(stream, cmd, arg);
    },
    readFile: function (path, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 0;
      opts.encoding = opts.encoding || "binary";
      if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
        throw new Error('Invalid encoding type "' + opts.encoding + '"');
      }
      var ret;
      var stream = FS.open(path, opts.flags);
      var stat = FS.stat(path);
      var length = stat.size;
      var buf = new Uint8Array(length);
      FS.read(stream, buf, 0, length, 0);
      if (opts.encoding === "utf8") {
        ret = UTF8ArrayToString(buf, 0);
      } else if (opts.encoding === "binary") {
        ret = buf;
      }
      FS.close(stream);
      return ret;
    },
    writeFile: function (path, data, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 577;
      var stream = FS.open(path, opts.flags, opts.mode);
      if (typeof data === "string") {
        var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
        var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
        FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
      } else if (ArrayBuffer.isView(data)) {
        FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
      } else {
        throw new Error("Unsupported data type");
      }
      FS.close(stream);
    },
    cwd: function () {
      return FS.currentPath;
    },
    chdir: function (path) {
      var lookup = FS.lookupPath(path, {
        follow: true,
      });
      if (lookup.node === null) {
        throw new FS.ErrnoError(44);
      }
      if (!FS.isDir(lookup.node.mode)) {
        throw new FS.ErrnoError(54);
      }
      var errCode = FS.nodePermissions(lookup.node, "x");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
      FS.currentPath = lookup.path;
    },
    createDefaultDirectories: function () {
      FS.mkdir("/tmp");
      FS.mkdir("/home");
      FS.mkdir("/home/web_user");
    },
    createDefaultDevices: function () {
      FS.mkdir("/dev");
      FS.registerDevice(FS.makedev(1, 3), {
        read: function () {
          return 0;
        },
        write: function (stream, buffer, offset, length, pos) {
          return length;
        },
      });
      FS.mkdev("/dev/null", FS.makedev(1, 3));
      TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
      TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
      FS.mkdev("/dev/tty", FS.makedev(5, 0));
      FS.mkdev("/dev/tty1", FS.makedev(6, 0));
      var random_device = getRandomDevice();
      FS.createDevice("/dev", "random", random_device);
      FS.createDevice("/dev", "urandom", random_device);
      FS.mkdir("/dev/shm");
      FS.mkdir("/dev/shm/tmp");
    },
    createSpecialDirectories: function () {
      FS.mkdir("/proc");
      var proc_self = FS.mkdir("/proc/self");
      FS.mkdir("/proc/self/fd");
      FS.mount(
        {
          mount: function () {
            var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
            node.node_ops = {
              lookup: function (parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(8);
                var ret = {
                  parent: null,
                  mount: {
                    mountpoint: "fake",
                  },
                  node_ops: {
                    readlink: function () {
                      return stream.path;
                    },
                  },
                };
                ret.parent = ret;
                return ret;
              },
            };
            return node;
          },
        },
        {},
        "/proc/self/fd"
      );
    },
    createStandardStreams: function () {
      if (Module["stdin"]) {
        FS.createDevice("/dev", "stdin", Module["stdin"]);
      } else {
        FS.symlink("/dev/tty", "/dev/stdin");
      }
      if (Module["stdout"]) {
        FS.createDevice("/dev", "stdout", null, Module["stdout"]);
      } else {
        FS.symlink("/dev/tty", "/dev/stdout");
      }
      if (Module["stderr"]) {
        FS.createDevice("/dev", "stderr", null, Module["stderr"]);
      } else {
        FS.symlink("/dev/tty1", "/dev/stderr");
      }
      var stdin = FS.open("/dev/stdin", 0);
      var stdout = FS.open("/dev/stdout", 1);
      var stderr = FS.open("/dev/stderr", 1);
    },
    ensureErrnoError: function () {
      if (FS.ErrnoError) return;
      FS.ErrnoError = function ErrnoError(errno, node) {
        this.node = node;
        this.setErrno = function (errno) {
          this.errno = errno;
        };
        this.setErrno(errno);
        this.message = "FS error";
      };
      FS.ErrnoError.prototype = new Error();
      FS.ErrnoError.prototype.constructor = FS.ErrnoError;
      [44].forEach(function (code) {
        FS.genericErrors[code] = new FS.ErrnoError(code);
        FS.genericErrors[code].stack = "<generic error, no stack>";
      });
    },
    staticInit: function () {
      FS.ensureErrnoError();
      FS.nameTable = new Array(4096);
      FS.mount(MEMFS, {}, "/");
      FS.createDefaultDirectories();
      FS.createDefaultDevices();
      FS.createSpecialDirectories();
      FS.filesystems = {
        MEMFS: MEMFS,
        IDBFS: IDBFS,
      };
    },
    init: function (input, output, error) {
      FS.init.initialized = true;
      FS.ensureErrnoError();
      Module["stdin"] = input || Module["stdin"];
      Module["stdout"] = output || Module["stdout"];
      Module["stderr"] = error || Module["stderr"];
      FS.createStandardStreams();
    },
    quit: function () {
      FS.init.initialized = false;
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      for (var i = 0; i < FS.streams.length; i++) {
        var stream = FS.streams[i];
        if (!stream) {
          continue;
        }
        FS.close(stream);
      }
    },
    getMode: function (canRead, canWrite) {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    },
    findObject: function (path, dontResolveLastLink) {
      var ret = FS.analyzePath(path, dontResolveLastLink);
      if (ret.exists) {
        return ret.object;
      } else {
        return null;
      }
    },
    analyzePath: function (path, dontResolveLastLink) {
      try {
        var lookup = FS.lookupPath(path, {
          follow: !dontResolveLastLink,
        });
        path = lookup.path;
      } catch (e) {}
      var ret = {
        isRoot: false,
        exists: false,
        error: 0,
        name: null,
        path: null,
        object: null,
        parentExists: false,
        parentPath: null,
        parentObject: null,
      };
      try {
        var lookup = FS.lookupPath(path, {
          parent: true,
        });
        ret.parentExists = true;
        ret.parentPath = lookup.path;
        ret.parentObject = lookup.node;
        ret.name = PATH.basename(path);
        lookup = FS.lookupPath(path, {
          follow: !dontResolveLastLink,
        });
        ret.exists = true;
        ret.path = lookup.path;
        ret.object = lookup.node;
        ret.name = lookup.node.name;
        ret.isRoot = lookup.path === "/";
      } catch (e) {
        ret.error = e.errno;
      }
      return ret;
    },
    createPath: function (parent, path, canRead, canWrite) {
      parent = typeof parent === "string" ? parent : FS.getPath(parent);
      var parts = path.split("/").reverse();
      while (parts.length) {
        var part = parts.pop();
        if (!part) continue;
        var current = PATH.join2(parent, part);
        try {
          FS.mkdir(current);
        } catch (e) {}
        parent = current;
      }
      return current;
    },
    createFile: function (parent, name, properties, canRead, canWrite) {
      var path = PATH.join2(
        typeof parent === "string" ? parent : FS.getPath(parent),
        name
      );
      var mode = FS.getMode(canRead, canWrite);
      return FS.create(path, mode);
    },
    createDataFile: function (parent, name, data, canRead, canWrite, canOwn) {
      var path = name
        ? PATH.join2(
            typeof parent === "string" ? parent : FS.getPath(parent),
            name
          )
        : parent;
      var mode = FS.getMode(canRead, canWrite);
      var node = FS.create(path, mode);
      if (data) {
        if (typeof data === "string") {
          var arr = new Array(data.length);
          for (var i = 0, len = data.length; i < len; ++i)
            arr[i] = data.charCodeAt(i);
          data = arr;
        }
        FS.chmod(node, mode | 146);
        var stream = FS.open(node, 577);
        FS.write(stream, data, 0, data.length, 0, canOwn);
        FS.close(stream);
        FS.chmod(node, mode);
      }
      return node;
    },
    createDevice: function (parent, name, input, output) {
      var path = PATH.join2(
        typeof parent === "string" ? parent : FS.getPath(parent),
        name
      );
      var mode = FS.getMode(!!input, !!output);
      if (!FS.createDevice.major) FS.createDevice.major = 64;
      var dev = FS.makedev(FS.createDevice.major++, 0);
      FS.registerDevice(dev, {
        open: function (stream) {
          stream.seekable = false;
        },
        close: function (stream) {
          if (output && output.buffer && output.buffer.length) {
            output(10);
          }
        },
        read: function (stream, buffer, offset, length, pos) {
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = input();
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset + i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
        write: function (stream, buffer, offset, length, pos) {
          for (var i = 0; i < length; i++) {
            try {
              output(buffer[offset + i]);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        },
      });
      return FS.mkdev(path, mode, dev);
    },
    forceLoadFile: function (obj) {
      if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
      if (typeof XMLHttpRequest !== "undefined") {
        throw new Error(
          "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread."
        );
      } else if (read_) {
        try {
          obj.contents = intArrayFromString(read_(obj.url), true);
          obj.usedBytes = obj.contents.length;
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
      } else {
        throw new Error("Cannot load without read() or XMLHttpRequest.");
      }
    },
    createLazyFile: function (parent, name, url, canRead, canWrite) {
      function LazyUint8Array() {
        this.lengthKnown = false;
        this.chunks = [];
      }
      LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
        if (idx > this.length - 1 || idx < 0) {
          return undefined;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = (idx / this.chunkSize) | 0;
        return this.getter(chunkNum)[chunkOffset];
      };
      LazyUint8Array.prototype.setDataGetter =
        function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        };
      LazyUint8Array.prototype.cacheLength =
        function LazyUint8Array_cacheLength() {
          var xhr = new XMLHttpRequest();
          xhr.open("HEAD", url, false);
          xhr.send(null);
          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing =
            (header = xhr.getResponseHeader("Accept-Ranges")) &&
            header === "bytes";
          var usesGzip =
            (header = xhr.getResponseHeader("Content-Encoding")) &&
            header === "gzip";
          var chunkSize = 1024 * 1024;
          if (!hasByteServing) chunkSize = datalength;
          var doXHR = function (from, to) {
            if (from > to)
              throw new Error(
                "invalid range (" +
                  from +
                  ", " +
                  to +
                  ") or no bytes requested!"
              );
            if (to > datalength - 1)
              throw new Error(
                "only " + datalength + " bytes available! programmer error!"
              );
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            if (datalength !== chunkSize)
              xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
            if (typeof Uint8Array != "undefined")
              xhr.responseType = "arraybuffer";
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType("text/plain; charset=x-user-defined");
            }
            xhr.send(null);
            if (
              !((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
            )
              throw new Error(
                "Couldn't load " + url + ". Status: " + xhr.status
              );
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || "", true);
            }
          };
          var lazyArray = this;
          lazyArray.setDataGetter(function (chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum + 1) * chunkSize - 1;
            end = Math.min(end, datalength - 1);
            if (typeof lazyArray.chunks[chunkNum] === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof lazyArray.chunks[chunkNum] === "undefined")
              throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
          if (usesGzip || !datalength) {
            chunkSize = datalength = 1;
            datalength = this.getter(0).length;
            chunkSize = datalength;
            out(
              "LazyFiles on gzip forces download of the whole file when length is accessed"
            );
          }
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        };
      if (typeof XMLHttpRequest !== "undefined") {
        if (!ENVIRONMENT_IS_WORKER)
          throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
        var lazyArray = new LazyUint8Array();
        Object.defineProperties(lazyArray, {
          length: {
            get: function () {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._length;
            },
          },
          chunkSize: {
            get: function () {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._chunkSize;
            },
          },
        });
        var properties = {
          isDevice: false,
          contents: lazyArray,
        };
      } else {
        var properties = {
          isDevice: false,
          url: url,
        };
      }
      var node = FS.createFile(parent, name, properties, canRead, canWrite);
      if (properties.contents) {
        node.contents = properties.contents;
      } else if (properties.url) {
        node.contents = null;
        node.url = properties.url;
      }
      Object.defineProperties(node, {
        usedBytes: {
          get: function () {
            return this.contents.length;
          },
        },
      });
      var stream_ops = {};
      var keys = Object.keys(node.stream_ops);
      keys.forEach(function (key) {
        var fn = node.stream_ops[key];
        stream_ops[key] = function forceLoadLazyFile() {
          FS.forceLoadFile(node);
          return fn.apply(null, arguments);
        };
      });
      stream_ops.read = function stream_ops_read(
        stream,
        buffer,
        offset,
        length,
        position
      ) {
        FS.forceLoadFile(node);
        var contents = stream.node.contents;
        if (position >= contents.length) return 0;
        var size = Math.min(contents.length - position, length);
        if (contents.slice) {
          for (var i = 0; i < size; i++) {
            buffer[offset + i] = contents[position + i];
          }
        } else {
          for (var i = 0; i < size; i++) {
            buffer[offset + i] = contents.get(position + i);
          }
        }
        return size;
      };
      node.stream_ops = stream_ops;
      return node;
    },
    createPreloadedFile: function (
      parent,
      name,
      url,
      canRead,
      canWrite,
      onload,
      onerror,
      dontCreateFile,
      canOwn,
      preFinish
    ) {
      Browser.init();
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency("cp " + fullname);
      function processData(byteArray) {
        function finish(byteArray) {
          if (preFinish) preFinish();
          if (!dontCreateFile) {
            FS.createDataFile(
              parent,
              name,
              byteArray,
              canRead,
              canWrite,
              canOwn
            );
          }
          if (onload) onload();
          removeRunDependency(dep);
        }
        var handled = false;
        Module["preloadPlugins"].forEach(function (plugin) {
          if (handled) return;
          if (plugin["canHandle"](fullname)) {
            plugin["handle"](byteArray, fullname, finish, function () {
              if (onerror) onerror();
              removeRunDependency(dep);
            });
            handled = true;
          }
        });
        if (!handled) finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == "string") {
        Browser.asyncLoad(
          url,
          function (byteArray) {
            processData(byteArray);
          },
          onerror
        );
      } else {
        processData(url);
      }
    },
    indexedDB: function () {
      return (
        window.indexedDB ||
        window.mozIndexedDB ||
        window.webkitIndexedDB ||
        window.msIndexedDB
      );
    },
    DB_NAME: function () {
      return "EM_FS_" + window.location.pathname;
    },
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: function (paths, onload, onerror) {
      onload = onload || function () {};
      onerror = onerror || function () {};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
        out("creating db");
        var db = openRequest.result;
        db.createObjectStore(FS.DB_STORE_NAME);
      };
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0,
          fail = 0,
          total = paths.length;
        function finish() {
          if (fail == 0) onload();
          else onerror();
        }
        paths.forEach(function (path) {
          var putRequest = files.put(
            FS.analyzePath(path).object.contents,
            path
          );
          putRequest.onsuccess = function putRequest_onsuccess() {
            ok++;
            if (ok + fail == total) finish();
          };
          putRequest.onerror = function putRequest_onerror() {
            fail++;
            if (ok + fail == total) finish();
          };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    },
    loadFilesFromDB: function (paths, onload, onerror) {
      onload = onload || function () {};
      onerror = onerror || function () {};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = onerror;
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        try {
          var transaction = db.transaction([FS.DB_STORE_NAME], "readonly");
        } catch (e) {
          onerror(e);
          return;
        }
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0,
          fail = 0,
          total = paths.length;
        function finish() {
          if (fail == 0) onload();
          else onerror();
        }
        paths.forEach(function (path) {
          var getRequest = files.get(path);
          getRequest.onsuccess = function getRequest_onsuccess() {
            if (FS.analyzePath(path).exists) {
              FS.unlink(path);
            }
            FS.createDataFile(
              PATH.dirname(path),
              PATH.basename(path),
              getRequest.result,
              true,
              true,
              true
            );
            ok++;
            if (ok + fail == total) finish();
          };
          getRequest.onerror = function getRequest_onerror() {
            fail++;
            if (ok + fail == total) finish();
          };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    },
  };
  var SYSCALLS = {
    mappings: {},
    DEFAULT_POLLMASK: 5,
    umask: 511,
    calculateAt: function (dirfd, path, allowEmpty) {
      if (path[0] === "/") {
        return path;
      }
      var dir;
      if (dirfd === -100) {
        dir = FS.cwd();
      } else {
        var dirstream = FS.getStream(dirfd);
        if (!dirstream) throw new FS.ErrnoError(8);
        dir = dirstream.path;
      }
      if (path.length == 0) {
        if (!allowEmpty) {
          throw new FS.ErrnoError(44);
        }
        return dir;
      }
      return PATH.join2(dir, path);
    },
    doStat: function (func, path, buf) {
      try {
        var stat = func(path);
      } catch (e) {
        if (
          e &&
          e.node &&
          PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))
        ) {
          return -54;
        }
        throw e;
      }
      HEAP32[buf >> 2] = stat.dev;
      HEAP32[(buf + 4) >> 2] = 0;
      HEAP32[(buf + 8) >> 2] = stat.ino;
      HEAP32[(buf + 12) >> 2] = stat.mode;
      HEAP32[(buf + 16) >> 2] = stat.nlink;
      HEAP32[(buf + 20) >> 2] = stat.uid;
      HEAP32[(buf + 24) >> 2] = stat.gid;
      HEAP32[(buf + 28) >> 2] = stat.rdev;
      HEAP32[(buf + 32) >> 2] = 0;
      (tempI64 = [
        stat.size >>> 0,
        ((tempDouble = stat.size),
        +Math.abs(tempDouble) >= 1
          ? tempDouble > 0
            ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) |
                0) >>>
              0
            : ~~+Math.ceil(
                (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
              ) >>> 0
          : 0),
      ]),
        (HEAP32[(buf + 40) >> 2] = tempI64[0]),
        (HEAP32[(buf + 44) >> 2] = tempI64[1]);
      HEAP32[(buf + 48) >> 2] = 4096;
      HEAP32[(buf + 52) >> 2] = stat.blocks;
      HEAP32[(buf + 56) >> 2] = (stat.atime.getTime() / 1e3) | 0;
      HEAP32[(buf + 60) >> 2] = 0;
      HEAP32[(buf + 64) >> 2] = (stat.mtime.getTime() / 1e3) | 0;
      HEAP32[(buf + 68) >> 2] = 0;
      HEAP32[(buf + 72) >> 2] = (stat.ctime.getTime() / 1e3) | 0;
      HEAP32[(buf + 76) >> 2] = 0;
      (tempI64 = [
        stat.ino >>> 0,
        ((tempDouble = stat.ino),
        +Math.abs(tempDouble) >= 1
          ? tempDouble > 0
            ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) |
                0) >>>
              0
            : ~~+Math.ceil(
                (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
              ) >>> 0
          : 0),
      ]),
        (HEAP32[(buf + 80) >> 2] = tempI64[0]),
        (HEAP32[(buf + 84) >> 2] = tempI64[1]);
      return 0;
    },
    doMsync: function (addr, stream, len, flags, offset) {
      var buffer = HEAPU8.slice(addr, addr + len);
      FS.msync(stream, buffer, offset, len, flags);
    },
    doMkdir: function (path, mode) {
      path = PATH.normalize(path);
      if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
      FS.mkdir(path, mode, 0);
      return 0;
    },
    doMknod: function (path, mode, dev) {
      switch (mode & 61440) {
        case 32768:
        case 8192:
        case 24576:
        case 4096:
        case 49152:
          break;
        default:
          return -28;
      }
      FS.mknod(path, mode, dev);
      return 0;
    },
    doReadlink: function (path, buf, bufsize) {
      if (bufsize <= 0) return -28;
      var ret = FS.readlink(path);
      var len = Math.min(bufsize, lengthBytesUTF8(ret));
      var endChar = HEAP8[buf + len];
      stringToUTF8(ret, buf, bufsize + 1);
      HEAP8[buf + len] = endChar;
      return len;
    },
    doAccess: function (path, amode) {
      if (amode & ~7) {
        return -28;
      }
      var node;
      var lookup = FS.lookupPath(path, {
        follow: true,
      });
      node = lookup.node;
      if (!node) {
        return -44;
      }
      var perms = "";
      if (amode & 4) perms += "r";
      if (amode & 2) perms += "w";
      if (amode & 1) perms += "x";
      if (perms && FS.nodePermissions(node, perms)) {
        return -2;
      }
      return 0;
    },
    doDup: function (path, flags, suggestFD) {
      var suggest = FS.getStream(suggestFD);
      if (suggest) FS.close(suggest);
      return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
    },
    doReadv: function (stream, iov, iovcnt, offset) {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(iov + i * 8) >> 2];
        var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break;
      }
      return ret;
    },
    doWritev: function (stream, iov, iovcnt, offset) {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(iov + i * 8) >> 2];
        var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
      }
      return ret;
    },
    varargs: undefined,
    get: function () {
      SYSCALLS.varargs += 4;
      var ret = HEAP32[(SYSCALLS.varargs - 4) >> 2];
      return ret;
    },
    getStr: function (ptr) {
      var ret = UTF8ToString(ptr);
      return ret;
    },
    getStreamFromFD: function (fd) {
      var stream = FS.getStream(fd);
      if (!stream) throw new FS.ErrnoError(8);
      return stream;
    },
    get64: function (low, high) {
      return low;
    },
  };
  function ___sys_chdir(path) {
    try {
      path = SYSCALLS.getStr(path);
      FS.chdir(path);
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function setErrNo(value) {
    HEAP32[___errno_location() >> 2] = value;
    return value;
  }
  function ___sys_fcntl64(fd, cmd, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = SYSCALLS.get();
          if (arg < 0) {
            return -28;
          }
          var newStream;
          newStream = FS.open(stream.path, stream.flags, 0, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;
        case 3:
          return stream.flags;
        case 4: {
          var arg = SYSCALLS.get();
          stream.flags |= arg;
          return 0;
        }
        case 12: {
          var arg = SYSCALLS.get();
          var offset = 0;
          HEAP16[(arg + offset) >> 1] = 2;
          return 0;
        }
        case 13:
        case 14:
          return 0;
        case 16:
        case 8:
          return -28;
        case 9:
          setErrNo(28);
          return -1;
        default: {
          return -28;
        }
      }
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___sys_ioctl(fd, op, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = SYSCALLS.get();
          HEAP32[argp >> 2] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28;
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21524: {
          if (!stream.tty) return -59;
          return 0;
        }
        default:
          abort("bad ioctl syscall " + op);
      }
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___sys_mkdir(path, mode) {
    try {
      path = SYSCALLS.getStr(path);
      return SYSCALLS.doMkdir(path, mode);
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___sys_open(path, flags, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var pathname = SYSCALLS.getStr(path);
      var mode = varargs ? SYSCALLS.get() : 0;
      var stream = FS.open(pathname, flags, mode);
      return stream.fd;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function __embind_register_bigint(
    primitiveType,
    name,
    size,
    minRange,
    maxRange
  ) {}
  function getShiftFromSize(size) {
    switch (size) {
      case 1:
        return 0;
      case 2:
        return 1;
      case 4:
        return 2;
      case 8:
        return 3;
      default:
        throw new TypeError("Unknown type size: " + size);
    }
  }
  function embind_init_charCodes() {
    var codes = new Array(256);
    for (var i = 0; i < 256; ++i) {
      codes[i] = String.fromCharCode(i);
    }
    embind_charCodes = codes;
  }
  var embind_charCodes = undefined;
  function readLatin1String(ptr) {
    var ret = "";
    var c = ptr;
    while (HEAPU8[c]) {
      ret += embind_charCodes[HEAPU8[c++]];
    }
    return ret;
  }
  var awaitingDependencies = {};
  var registeredTypes = {};
  var typeDependencies = {};
  var char_0 = 48;
  var char_9 = 57;
  function makeLegalFunctionName(name) {
    if (undefined === name) {
      return "_unknown";
    }
    name = name.replace(/[^a-zA-Z0-9_]/g, "$");
    var f = name.charCodeAt(0);
    if (f >= char_0 && f <= char_9) {
      return "_" + name;
    } else {
      return name;
    }
  }
  function createNamedFunction(name, body) {
    name = makeLegalFunctionName(name);
    return new Function(
      "body",
      "return function " +
        name +
        "() {\n" +
        '    "use strict";' +
        "    return body.apply(this, arguments);\n" +
        "};\n"
    )(body);
  }
  function extendError(baseErrorType, errorName) {
    var errorClass = createNamedFunction(errorName, function (message) {
      this.name = errorName;
      this.message = message;
      var stack = new Error(message).stack;
      if (stack !== undefined) {
        this.stack =
          this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
      }
    });
    errorClass.prototype = Object.create(baseErrorType.prototype);
    errorClass.prototype.constructor = errorClass;
    errorClass.prototype.toString = function () {
      if (this.message === undefined) {
        return this.name;
      } else {
        return this.name + ": " + this.message;
      }
    };
    return errorClass;
  }
  var BindingError = undefined;
  function throwBindingError(message) {
    throw new BindingError(message);
  }
  var InternalError = undefined;
  function registerType(rawType, registeredInstance, options) {
    options = options || {};
    if (!("argPackAdvance" in registeredInstance)) {
      throw new TypeError(
        "registerType registeredInstance requires argPackAdvance"
      );
    }
    var name = registeredInstance.name;
    if (!rawType) {
      throwBindingError(
        'type "' + name + '" must have a positive integer typeid pointer'
      );
    }
    if (registeredTypes.hasOwnProperty(rawType)) {
      if (options.ignoreDuplicateRegistrations) {
        return;
      } else {
        throwBindingError("Cannot register type '" + name + "' twice");
      }
    }
    registeredTypes[rawType] = registeredInstance;
    delete typeDependencies[rawType];
    if (awaitingDependencies.hasOwnProperty(rawType)) {
      var callbacks = awaitingDependencies[rawType];
      delete awaitingDependencies[rawType];
      callbacks.forEach(function (cb) {
        cb();
      });
    }
  }
  function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
    var shift = getShiftFromSize(size);
    name = readLatin1String(name);
    registerType(rawType, {
      name: name,
      fromWireType: function (wt) {
        return !!wt;
      },
      toWireType: function (destructors, o) {
        return o ? trueValue : falseValue;
      },
      argPackAdvance: 8,
      readValueFromPointer: function (pointer) {
        var heap;
        if (size === 1) {
          heap = HEAP8;
        } else if (size === 2) {
          heap = HEAP16;
        } else if (size === 4) {
          heap = HEAP32;
        } else {
          throw new TypeError("Unknown boolean type size: " + name);
        }
        return this["fromWireType"](heap[pointer >> shift]);
      },
      destructorFunction: null,
    });
  }
  var emval_free_list = [];
  var emval_handle_array = [
    {},
    {
      value: undefined,
    },
    {
      value: null,
    },
    {
      value: true,
    },
    {
      value: false,
    },
  ];
  function __emval_decref(handle) {
    if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
      emval_handle_array[handle] = undefined;
      emval_free_list.push(handle);
    }
  }
  function count_emval_handles() {
    var count = 0;
    for (var i = 5; i < emval_handle_array.length; ++i) {
      if (emval_handle_array[i] !== undefined) {
        ++count;
      }
    }
    return count;
  }
  function get_first_emval() {
    for (var i = 5; i < emval_handle_array.length; ++i) {
      if (emval_handle_array[i] !== undefined) {
        return emval_handle_array[i];
      }
    }
    return null;
  }
  function init_emval() {
    Module["count_emval_handles"] = count_emval_handles;
    Module["get_first_emval"] = get_first_emval;
  }
  function __emval_register(value) {
    switch (value) {
      case undefined: {
        return 1;
      }
      case null: {
        return 2;
      }
      case true: {
        return 3;
      }
      case false: {
        return 4;
      }
      default: {
        var handle = emval_free_list.length
          ? emval_free_list.pop()
          : emval_handle_array.length;
        emval_handle_array[handle] = {
          refcount: 1,
          value: value,
        };
        return handle;
      }
    }
  }
  function simpleReadValueFromPointer(pointer) {
    return this["fromWireType"](HEAPU32[pointer >> 2]);
  }
  function __embind_register_emval(rawType, name) {
    name = readLatin1String(name);
    registerType(rawType, {
      name: name,
      fromWireType: function (handle) {
        var rv = emval_handle_array[handle].value;
        __emval_decref(handle);
        return rv;
      },
      toWireType: function (destructors, value) {
        return __emval_register(value);
      },
      argPackAdvance: 8,
      readValueFromPointer: simpleReadValueFromPointer,
      destructorFunction: null,
    });
  }
  function _embind_repr(v) {
    if (v === null) {
      return "null";
    }
    var t = typeof v;
    if (t === "object" || t === "array" || t === "function") {
      return v.toString();
    } else {
      return "" + v;
    }
  }
  function floatReadValueFromPointer(name, shift) {
    switch (shift) {
      case 2:
        return function (pointer) {
          return this["fromWireType"](HEAPF32[pointer >> 2]);
        };
      case 3:
        return function (pointer) {
          return this["fromWireType"](HEAPF64[pointer >> 3]);
        };
      default:
        throw new TypeError("Unknown float type: " + name);
    }
  }
  function __embind_register_float(rawType, name, size) {
    var shift = getShiftFromSize(size);
    name = readLatin1String(name);
    registerType(rawType, {
      name: name,
      fromWireType: function (value) {
        return value;
      },
      toWireType: function (destructors, value) {
        if (typeof value !== "number" && typeof value !== "boolean") {
          throw new TypeError(
            'Cannot convert "' + _embind_repr(value) + '" to ' + this.name
          );
        }
        return value;
      },
      argPackAdvance: 8,
      readValueFromPointer: floatReadValueFromPointer(name, shift),
      destructorFunction: null,
    });
  }
  function integerReadValueFromPointer(name, shift, signed) {
    switch (shift) {
      case 0:
        return signed
          ? function readS8FromPointer(pointer) {
              return HEAP8[pointer];
            }
          : function readU8FromPointer(pointer) {
              return HEAPU8[pointer];
            };
      case 1:
        return signed
          ? function readS16FromPointer(pointer) {
              return HEAP16[pointer >> 1];
            }
          : function readU16FromPointer(pointer) {
              return HEAPU16[pointer >> 1];
            };
      case 2:
        return signed
          ? function readS32FromPointer(pointer) {
              return HEAP32[pointer >> 2];
            }
          : function readU32FromPointer(pointer) {
              return HEAPU32[pointer >> 2];
            };
      default:
        throw new TypeError("Unknown integer type: " + name);
    }
  }
  function __embind_register_integer(
    primitiveType,
    name,
    size,
    minRange,
    maxRange
  ) {
    name = readLatin1String(name);
    if (maxRange === -1) {
      maxRange = 4294967295;
    }
    var shift = getShiftFromSize(size);
    var fromWireType = function (value) {
      return value;
    };
    if (minRange === 0) {
      var bitshift = 32 - 8 * size;
      fromWireType = function (value) {
        return (value << bitshift) >>> bitshift;
      };
    }
    var isUnsignedType = name.includes("unsigned");
    registerType(primitiveType, {
      name: name,
      fromWireType: fromWireType,
      toWireType: function (destructors, value) {
        if (typeof value !== "number" && typeof value !== "boolean") {
          throw new TypeError(
            'Cannot convert "' + _embind_repr(value) + '" to ' + this.name
          );
        }
        if (value < minRange || value > maxRange) {
          throw new TypeError(
            'Passing a number "' +
              _embind_repr(value) +
              '" from JS side to C/C++ side to an argument of type "' +
              name +
              '", which is outside the valid range [' +
              minRange +
              ", " +
              maxRange +
              "]!"
          );
        }
        return isUnsignedType ? value >>> 0 : value | 0;
      },
      argPackAdvance: 8,
      readValueFromPointer: integerReadValueFromPointer(
        name,
        shift,
        minRange !== 0
      ),
      destructorFunction: null,
    });
  }
  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
    var typeMapping = [
      Int8Array,
      Uint8Array,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
    ];
    var TA = typeMapping[dataTypeIndex];
    function decodeMemoryView(handle) {
      handle = handle >> 2;
      var heap = HEAPU32;
      var size = heap[handle];
      var data = heap[handle + 1];
      return new TA(buffer, data, size);
    }
    name = readLatin1String(name);
    registerType(
      rawType,
      {
        name: name,
        fromWireType: decodeMemoryView,
        argPackAdvance: 8,
        readValueFromPointer: decodeMemoryView,
      },
      {
        ignoreDuplicateRegistrations: true,
      }
    );
  }
  function __embind_register_std_string(rawType, name) {
    name = readLatin1String(name);
    var stdStringIsUTF8 = name === "std::string";
    registerType(rawType, {
      name: name,
      fromWireType: function (value) {
        var length = HEAPU32[value >> 2];
        var str;
        if (stdStringIsUTF8) {
          var decodeStartPtr = value + 4;
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i;
            if (i == length || HEAPU8[currentBytePtr] == 0) {
              var maxRead = currentBytePtr - decodeStartPtr;
              var stringSegment = UTF8ToString(decodeStartPtr, maxRead);
              if (str === undefined) {
                str = stringSegment;
              } else {
                str += String.fromCharCode(0);
                str += stringSegment;
              }
              decodeStartPtr = currentBytePtr + 1;
            }
          }
        } else {
          var a = new Array(length);
          for (var i = 0; i < length; ++i) {
            a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
          }
          str = a.join("");
        }
        _free(value);
        return str;
      },
      toWireType: function (destructors, value) {
        if (value instanceof ArrayBuffer) {
          value = new Uint8Array(value);
        }
        var getLength;
        var valueIsOfTypeString = typeof value === "string";
        if (
          !(
            valueIsOfTypeString ||
            value instanceof Uint8Array ||
            value instanceof Uint8ClampedArray ||
            value instanceof Int8Array
          )
        ) {
          throwBindingError("Cannot pass non-string to std::string");
        }
        if (stdStringIsUTF8 && valueIsOfTypeString) {
          getLength = function () {
            return lengthBytesUTF8(value);
          };
        } else {
          getLength = function () {
            return value.length;
          };
        }
        var length = getLength();
        var ptr = _malloc(4 + length + 1);
        HEAPU32[ptr >> 2] = length;
        if (stdStringIsUTF8 && valueIsOfTypeString) {
          stringToUTF8(value, ptr + 4, length + 1);
        } else {
          if (valueIsOfTypeString) {
            for (var i = 0; i < length; ++i) {
              var charCode = value.charCodeAt(i);
              if (charCode > 255) {
                _free(ptr);
                throwBindingError(
                  "String has UTF-16 code units that do not fit in 8 bits"
                );
              }
              HEAPU8[ptr + 4 + i] = charCode;
            }
          } else {
            for (var i = 0; i < length; ++i) {
              HEAPU8[ptr + 4 + i] = value[i];
            }
          }
        }
        if (destructors !== null) {
          destructors.push(_free, ptr);
        }
        return ptr;
      },
      argPackAdvance: 8,
      readValueFromPointer: simpleReadValueFromPointer,
      destructorFunction: function (ptr) {
        _free(ptr);
      },
    });
  }
  function __embind_register_std_wstring(rawType, charSize, name) {
    name = readLatin1String(name);
    var decodeString, encodeString, getHeap, lengthBytesUTF, shift;
    if (charSize === 2) {
      decodeString = UTF16ToString;
      encodeString = stringToUTF16;
      lengthBytesUTF = lengthBytesUTF16;
      getHeap = function () {
        return HEAPU16;
      };
      shift = 1;
    } else if (charSize === 4) {
      decodeString = UTF32ToString;
      encodeString = stringToUTF32;
      lengthBytesUTF = lengthBytesUTF32;
      getHeap = function () {
        return HEAPU32;
      };
      shift = 2;
    }
    registerType(rawType, {
      name: name,
      fromWireType: function (value) {
        var length = HEAPU32[value >> 2];
        var HEAP = getHeap();
        var str;
        var decodeStartPtr = value + 4;
        for (var i = 0; i <= length; ++i) {
          var currentBytePtr = value + 4 + i * charSize;
          if (i == length || HEAP[currentBytePtr >> shift] == 0) {
            var maxReadBytes = currentBytePtr - decodeStartPtr;
            var stringSegment = decodeString(decodeStartPtr, maxReadBytes);
            if (str === undefined) {
              str = stringSegment;
            } else {
              str += String.fromCharCode(0);
              str += stringSegment;
            }
            decodeStartPtr = currentBytePtr + charSize;
          }
        }
        _free(value);
        return str;
      },
      toWireType: function (destructors, value) {
        if (!(typeof value === "string")) {
          throwBindingError(
            "Cannot pass non-string to C++ string type " + name
          );
        }
        var length = lengthBytesUTF(value);
        var ptr = _malloc(4 + length + charSize);
        HEAPU32[ptr >> 2] = length >> shift;
        encodeString(value, ptr + 4, length + charSize);
        if (destructors !== null) {
          destructors.push(_free, ptr);
        }
        return ptr;
      },
      argPackAdvance: 8,
      readValueFromPointer: simpleReadValueFromPointer,
      destructorFunction: function (ptr) {
        _free(ptr);
      },
    });
  }
  function __embind_register_void(rawType, name) {
    name = readLatin1String(name);
    registerType(rawType, {
      isVoid: true,
      name: name,
      argPackAdvance: 0,
      fromWireType: function () {
        return undefined;
      },
      toWireType: function (destructors, o) {
        return undefined;
      },
    });
  }
  function _abort() {
    abort();
  }
  var _emscripten_get_now;
  if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function () {
      var t = process["hrtime"]();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== "undefined") {
    _emscripten_get_now = dateNow;
  } else
    _emscripten_get_now = function () {
      return performance.now();
    };
  var _emscripten_get_now_is_monotonic = true;
  function _clock_gettime(clk_id, tp) {
    var now;
    if (clk_id === 0) {
      now = Date.now();
    } else if (
      (clk_id === 1 || clk_id === 4) &&
      _emscripten_get_now_is_monotonic
    ) {
      now = _emscripten_get_now();
    } else {
      setErrNo(28);
      return -1;
    }
    HEAP32[tp >> 2] = (now / 1e3) | 0;
    HEAP32[(tp + 4) >> 2] = ((now % 1e3) * 1e3 * 1e3) | 0;
    return 0;
  }
  function _dlclose(handle) {
    abort(
      "To use dlopen, you need to use Emscripten's linking support, see https://github.com/emscripten-core/emscripten/wiki/Linking"
    );
  }
  function _emscripten_set_main_loop_timing(mode, value) {
    Browser.mainLoop.timingMode = mode;
    Browser.mainLoop.timingValue = value;
    if (!Browser.mainLoop.func) {
      return 1;
    }
    if (!Browser.mainLoop.running) {
      Browser.mainLoop.running = true;
    }
    if (mode == 0) {
      Browser.mainLoop.scheduler =
        function Browser_mainLoop_scheduler_setTimeout() {
          var timeUntilNextTick =
            Math.max(
              0,
              Browser.mainLoop.tickStartTime + value - _emscripten_get_now()
            ) | 0;
          setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
        };
      Browser.mainLoop.method = "timeout";
    } else if (mode == 1) {
      Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
        Browser.requestAnimationFrame(Browser.mainLoop.runner);
      };
      Browser.mainLoop.method = "rAF";
    } else if (mode == 2) {
      if (typeof setImmediate === "undefined") {
        var setImmediates = [];
        var emscriptenMainLoopMessageId = "setimmediate";
        var Browser_setImmediate_messageHandler = function (event) {
          if (
            event.data === emscriptenMainLoopMessageId ||
            event.data.target === emscriptenMainLoopMessageId
          ) {
            event.stopPropagation();
            setImmediates.shift()();
          }
        };
        addEventListener("message", Browser_setImmediate_messageHandler, true);
        setImmediate = function Browser_emulated_setImmediate(func) {
          setImmediates.push(func);
          if (ENVIRONMENT_IS_WORKER) {
            if (Module["setImmediates"] === undefined)
              Module["setImmediates"] = [];
            Module["setImmediates"].push(func);
            postMessage({
              target: emscriptenMainLoopMessageId,
            });
          } else postMessage(emscriptenMainLoopMessageId, "*");
        };
      }
      Browser.mainLoop.scheduler =
        function Browser_mainLoop_scheduler_setImmediate() {
          setImmediate(Browser.mainLoop.runner);
        };
      Browser.mainLoop.method = "immediate";
    }
    return 0;
  }
  function _exit(status) {
    exit(status);
  }
  function maybeExit() {
    if (!keepRuntimeAlive()) {
      try {
        _exit(EXITSTATUS);
      } catch (e) {
        if (e instanceof ExitStatus) {
          return;
        }
        throw e;
      }
    }
  }
  function setMainLoop(
    browserIterationFunc,
    fps,
    simulateInfiniteLoop,
    arg,
    noSetTiming
  ) {
    assert(
      !Browser.mainLoop.func,
      "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters."
    );
    Browser.mainLoop.func = browserIterationFunc;
    Browser.mainLoop.arg = arg;
    var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
    function checkIsRunning() {
      if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {
        maybeExit();
        return false;
      }
      return true;
    }
    Browser.mainLoop.running = false;
    Browser.mainLoop.runner = function Browser_mainLoop_runner() {
      if (ABORT) return;
      if (Browser.mainLoop.queue.length > 0) {
        var start = Date.now();
        var blocker = Browser.mainLoop.queue.shift();
        blocker.func(blocker.arg);
        if (Browser.mainLoop.remainingBlockers) {
          var remaining = Browser.mainLoop.remainingBlockers;
          var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
          if (blocker.counted) {
            Browser.mainLoop.remainingBlockers = next;
          } else {
            next = next + 0.5;
            Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
          }
        }
        console.log(
          'main loop blocker "' +
            blocker.name +
            '" took ' +
            (Date.now() - start) +
            " ms"
        );
        Browser.mainLoop.updateStatus();
        if (!checkIsRunning()) return;
        setTimeout(Browser.mainLoop.runner, 0);
        return;
      }
      if (!checkIsRunning()) return;
      Browser.mainLoop.currentFrameNumber =
        (Browser.mainLoop.currentFrameNumber + 1) | 0;
      if (
        Browser.mainLoop.timingMode == 1 &&
        Browser.mainLoop.timingValue > 1 &&
        Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0
      ) {
        Browser.mainLoop.scheduler();
        return;
      } else if (Browser.mainLoop.timingMode == 0) {
        Browser.mainLoop.tickStartTime = _emscripten_get_now();
      }
      Browser.mainLoop.runIter(browserIterationFunc);
      if (!checkIsRunning()) return;
      if (typeof SDL === "object" && SDL.audio && SDL.audio.queueNewAudioData)
        SDL.audio.queueNewAudioData();
      Browser.mainLoop.scheduler();
    };
    if (!noSetTiming) {
      if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
      else _emscripten_set_main_loop_timing(1, 1);
      Browser.mainLoop.scheduler();
    }
    if (simulateInfiniteLoop) {
      throw "unwind";
    }
  }
  function callUserCallback(func, synchronous) {
    if (ABORT) {
      return;
    }
    if (synchronous) {
      func();
      return;
    }
    try {
      func();
    } catch (e) {
      if (e instanceof ExitStatus) {
        return;
      } else if (e !== "unwind") {
        if (e && typeof e === "object" && e.stack)
          err("exception thrown: " + [e, e.stack]);
        throw e;
      }
    }
  }
  var Browser = {
    mainLoop: {
      running: false,
      scheduler: null,
      method: "",
      currentlyRunningMainloop: 0,
      func: null,
      arg: 0,
      timingMode: 0,
      timingValue: 0,
      currentFrameNumber: 0,
      queue: [],
      pause: function () {
        Browser.mainLoop.scheduler = null;
        Browser.mainLoop.currentlyRunningMainloop++;
      },
      resume: function () {
        Browser.mainLoop.currentlyRunningMainloop++;
        var timingMode = Browser.mainLoop.timingMode;
        var timingValue = Browser.mainLoop.timingValue;
        var func = Browser.mainLoop.func;
        Browser.mainLoop.func = null;
        setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        Browser.mainLoop.scheduler();
      },
      updateStatus: function () {
        if (Module["setStatus"]) {
          var message = Module["statusMessage"] || "Please wait...";
          var remaining = Browser.mainLoop.remainingBlockers;
          var expected = Browser.mainLoop.expectedBlockers;
          if (remaining) {
            if (remaining < expected) {
              Module["setStatus"](
                message + " (" + (expected - remaining) + "/" + expected + ")"
              );
            } else {
              Module["setStatus"](message);
            }
          } else {
            Module["setStatus"]("");
          }
        }
      },
      runIter: function (func) {
        if (ABORT) return;
        if (Module["preMainLoop"]) {
          var preRet = Module["preMainLoop"]();
          if (preRet === false) {
            return;
          }
        }
        callUserCallback(func);
        if (Module["postMainLoop"]) Module["postMainLoop"]();
      },
    },
    isFullscreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    init: function () {
      if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
      if (Browser.initted) return;
      Browser.initted = true;
      try {
        new Blob();
        Browser.hasBlobConstructor = true;
      } catch (e) {
        Browser.hasBlobConstructor = false;
        console.log(
          "warning: no blob constructor, cannot create blobs with mimetypes"
        );
      }
      Browser.BlobBuilder =
        typeof MozBlobBuilder != "undefined"
          ? MozBlobBuilder
          : typeof WebKitBlobBuilder != "undefined"
          ? WebKitBlobBuilder
          : !Browser.hasBlobConstructor
          ? console.log("warning: no BlobBuilder")
          : null;
      Browser.URLObject =
        typeof window != "undefined"
          ? window.URL
            ? window.URL
            : window.webkitURL
          : undefined;
      if (!Module.noImageDecoding && typeof Browser.URLObject === "undefined") {
        console.log(
          "warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available."
        );
        Module.noImageDecoding = true;
      }
      var imagePlugin = {};
      imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
        return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
      };
      imagePlugin["handle"] = function imagePlugin_handle(
        byteArray,
        name,
        onload,
        onerror
      ) {
        var b = null;
        if (Browser.hasBlobConstructor) {
          try {
            b = new Blob([byteArray], {
              type: Browser.getMimetype(name),
            });
            if (b.size !== byteArray.length) {
              b = new Blob([new Uint8Array(byteArray).buffer], {
                type: Browser.getMimetype(name),
              });
            }
          } catch (e) {
            warnOnce(
              "Blob constructor present but fails: " +
                e +
                "; falling back to blob builder"
            );
          }
        }
        if (!b) {
          var bb = new Browser.BlobBuilder();
          bb.append(new Uint8Array(byteArray).buffer);
          b = bb.getBlob();
        }
        var url = Browser.URLObject.createObjectURL(b);
        var img = new Image();
        img.onload = function img_onload() {
          assert(img.complete, "Image " + name + " could not be decoded");
          var canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          Module["preloadedImages"][name] = canvas;
          Browser.URLObject.revokeObjectURL(url);
          if (onload) onload(byteArray);
        };
        img.onerror = function img_onerror(event) {
          console.log("Image " + url + " could not be decoded");
          if (onerror) onerror();
        };
        img.src = url;
      };
      Module["preloadPlugins"].push(imagePlugin);
      var audioPlugin = {};
      audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
        return (
          !Module.noAudioDecoding &&
          name.substr(-4) in
            {
              ".ogg": 1,
              ".wav": 1,
              ".mp3": 1,
            }
        );
      };
      audioPlugin["handle"] = function audioPlugin_handle(
        byteArray,
        name,
        onload,
        onerror
      ) {
        var done = false;
        function finish(audio) {
          if (done) return;
          done = true;
          Module["preloadedAudios"][name] = audio;
          if (onload) onload(byteArray);
        }
        function fail() {
          if (done) return;
          done = true;
          Module["preloadedAudios"][name] = new Audio();
          if (onerror) onerror();
        }
        if (Browser.hasBlobConstructor) {
          try {
            var b = new Blob([byteArray], {
              type: Browser.getMimetype(name),
            });
          } catch (e) {
            return fail();
          }
          var url = Browser.URLObject.createObjectURL(b);
          var audio = new Audio();
          audio.addEventListener(
            "canplaythrough",
            function () {
              finish(audio);
            },
            false
          );
          audio.onerror = function audio_onerror(event) {
            if (done) return;
            console.log(
              "warning: browser could not fully decode audio " +
                name +
                ", trying slower base64 approach"
            );
            function encode64(data) {
              var BASE =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
              var PAD = "=";
              var ret = "";
              var leftchar = 0;
              var leftbits = 0;
              for (var i = 0; i < data.length; i++) {
                leftchar = (leftchar << 8) | data[i];
                leftbits += 8;
                while (leftbits >= 6) {
                  var curr = (leftchar >> (leftbits - 6)) & 63;
                  leftbits -= 6;
                  ret += BASE[curr];
                }
              }
              if (leftbits == 2) {
                ret += BASE[(leftchar & 3) << 4];
                ret += PAD + PAD;
              } else if (leftbits == 4) {
                ret += BASE[(leftchar & 15) << 2];
                ret += PAD;
              }
              return ret;
            }
            audio.src =
              "data:audio/x-" +
              name.substr(-3) +
              ";base64," +
              encode64(byteArray);
            finish(audio);
          };
          audio.src = url;
          Browser.safeSetTimeout(function () {
            finish(audio);
          }, 1e4);
        } else {
          return fail();
        }
      };
      Module["preloadPlugins"].push(audioPlugin);
      function pointerLockChange() {
        Browser.pointerLock =
          document["pointerLockElement"] === Module["canvas"] ||
          document["mozPointerLockElement"] === Module["canvas"] ||
          document["webkitPointerLockElement"] === Module["canvas"] ||
          document["msPointerLockElement"] === Module["canvas"];
      }
      var canvas = Module["canvas"];
      if (canvas) {
        canvas.requestPointerLock =
          canvas["requestPointerLock"] ||
          canvas["mozRequestPointerLock"] ||
          canvas["webkitRequestPointerLock"] ||
          canvas["msRequestPointerLock"] ||
          function () {};
        canvas.exitPointerLock =
          document["exitPointerLock"] ||
          document["mozExitPointerLock"] ||
          document["webkitExitPointerLock"] ||
          document["msExitPointerLock"] ||
          function () {};
        canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
        document.addEventListener(
          "pointerlockchange",
          pointerLockChange,
          false
        );
        document.addEventListener(
          "mozpointerlockchange",
          pointerLockChange,
          false
        );
        document.addEventListener(
          "webkitpointerlockchange",
          pointerLockChange,
          false
        );
        document.addEventListener(
          "mspointerlockchange",
          pointerLockChange,
          false
        );
        if (Module["elementPointerLock"]) {
          canvas.addEventListener(
            "click",
            function (ev) {
              if (!Browser.pointerLock && Module["canvas"].requestPointerLock) {
                Module["canvas"].requestPointerLock();
                ev.preventDefault();
              }
            },
            false
          );
        }
      }
    },
    createContext: function (
      canvas,
      useWebGL,
      setInModule,
      webGLContextAttributes
    ) {
      if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
      var ctx;
      var contextHandle;
      if (useWebGL) {
        var contextAttributes = {
          antialias: false,
          alpha: false,
          majorVersion: 1,
        };
        if (webGLContextAttributes) {
          for (var attribute in webGLContextAttributes) {
            contextAttributes[attribute] = webGLContextAttributes[attribute];
          }
        }
        if (typeof GL !== "undefined") {
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
        }
      } else {
        ctx = canvas.getContext("2d");
      }
      if (!ctx) return null;
      if (setInModule) {
        if (!useWebGL)
          assert(
            typeof GLctx === "undefined",
            "cannot set in module if GLctx is used, but we are a non-GL context that would replace it"
          );
        Module.ctx = ctx;
        if (useWebGL) GL.makeContextCurrent(contextHandle);
        Module.useWebGL = useWebGL;
        Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
          callback();
        });
        Browser.init();
      }
      return ctx;
    },
    destroyContext: function (canvas, useWebGL, setInModule) {},
    fullscreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullscreen: function (lockPointer, resizeCanvas) {
      Browser.lockPointer = lockPointer;
      Browser.resizeCanvas = resizeCanvas;
      if (typeof Browser.lockPointer === "undefined")
        Browser.lockPointer = true;
      if (typeof Browser.resizeCanvas === "undefined")
        Browser.resizeCanvas = false;
      var canvas = Module["canvas"];
      function fullscreenChange() {
        Browser.isFullscreen = false;
        var canvasContainer = canvas.parentNode;
        if (
          (document["fullscreenElement"] ||
            document["mozFullScreenElement"] ||
            document["msFullscreenElement"] ||
            document["webkitFullscreenElement"] ||
            document["webkitCurrentFullScreenElement"]) === canvasContainer
        ) {
          canvas.exitFullscreen = Browser.exitFullscreen;
          if (Browser.lockPointer) canvas.requestPointerLock();
          Browser.isFullscreen = true;
          if (Browser.resizeCanvas) {
            Browser.setFullscreenCanvasSize();
          } else {
            Browser.updateCanvasDimensions(canvas);
          }
        } else {
          canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
          canvasContainer.parentNode.removeChild(canvasContainer);
          if (Browser.resizeCanvas) {
            Browser.setWindowedCanvasSize();
          } else {
            Browser.updateCanvasDimensions(canvas);
          }
        }
        if (Module["onFullScreen"])
          Module["onFullScreen"](Browser.isFullscreen);
        if (Module["onFullscreen"])
          Module["onFullscreen"](Browser.isFullscreen);
      }
      if (!Browser.fullscreenHandlersInstalled) {
        Browser.fullscreenHandlersInstalled = true;
        document.addEventListener("fullscreenchange", fullscreenChange, false);
        document.addEventListener(
          "mozfullscreenchange",
          fullscreenChange,
          false
        );
        document.addEventListener(
          "webkitfullscreenchange",
          fullscreenChange,
          false
        );
        document.addEventListener(
          "MSFullscreenChange",
          fullscreenChange,
          false
        );
      }
      var canvasContainer = document.createElement("div");
      canvas.parentNode.insertBefore(canvasContainer, canvas);
      canvasContainer.appendChild(canvas);
      canvasContainer.requestFullscreen =
        canvasContainer["requestFullscreen"] ||
        canvasContainer["mozRequestFullScreen"] ||
        canvasContainer["msRequestFullscreen"] ||
        (canvasContainer["webkitRequestFullscreen"]
          ? function () {
              canvasContainer["webkitRequestFullscreen"](
                Element["ALLOW_KEYBOARD_INPUT"]
              );
            }
          : null) ||
        (canvasContainer["webkitRequestFullScreen"]
          ? function () {
              canvasContainer["webkitRequestFullScreen"](
                Element["ALLOW_KEYBOARD_INPUT"]
              );
            }
          : null);
      canvasContainer.requestFullscreen();
    },
    exitFullscreen: function () {
      if (!Browser.isFullscreen) {
        return false;
      }
      var CFS =
        document["exitFullscreen"] ||
        document["cancelFullScreen"] ||
        document["mozCancelFullScreen"] ||
        document["msExitFullscreen"] ||
        document["webkitCancelFullScreen"] ||
        function () {};
      CFS.apply(document, []);
      return true;
    },
    nextRAF: 0,
    fakeRequestAnimationFrame: function (func) {
      var now = Date.now();
      if (Browser.nextRAF === 0) {
        Browser.nextRAF = now + 1e3 / 60;
      } else {
        while (now + 2 >= Browser.nextRAF) {
          Browser.nextRAF += 1e3 / 60;
        }
      }
      var delay = Math.max(Browser.nextRAF - now, 0);
      setTimeout(func, delay);
    },
    requestAnimationFrame: function (func) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(func);
        return;
      }
      var RAF = Browser.fakeRequestAnimationFrame;
      RAF(func);
    },
    safeRequestAnimationFrame: function (func) {
      return Browser.requestAnimationFrame(function () {
        callUserCallback(func);
      });
    },
    safeSetTimeout: function (func, timeout) {
      return setTimeout(function () {
        callUserCallback(func);
      }, timeout);
    },
    getMimetype: function (name) {
      return {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        bmp: "image/bmp",
        ogg: "audio/ogg",
        wav: "audio/wav",
        mp3: "audio/mpeg",
      }[name.substr(name.lastIndexOf(".") + 1)];
    },
    getUserMedia: function (func) {
      if (!window.getUserMedia) {
        window.getUserMedia =
          navigator["getUserMedia"] || navigator["mozGetUserMedia"];
      }
      window.getUserMedia(func);
    },
    getMovementX: function (event) {
      return (
        event["movementX"] ||
        event["mozMovementX"] ||
        event["webkitMovementX"] ||
        0
      );
    },
    getMovementY: function (event) {
      return (
        event["movementY"] ||
        event["mozMovementY"] ||
        event["webkitMovementY"] ||
        0
      );
    },
    getMouseWheelDelta: function (event) {
      var delta = 0;
      switch (event.type) {
        case "DOMMouseScroll":
          delta = event.detail / 3;
          break;
        case "mousewheel":
          delta = event.wheelDelta / 120;
          break;
        case "wheel":
          delta = event.deltaY;
          switch (event.deltaMode) {
            case 0:
              delta /= 100;
              break;
            case 1:
              delta /= 3;
              break;
            case 2:
              delta *= 80;
              break;
            default:
              throw "unrecognized mouse wheel delta mode: " + event.deltaMode;
          }
          break;
        default:
          throw "unrecognized mouse wheel event: " + event.type;
      }
      return delta;
    },
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseEvent: function (event) {
      if (Browser.pointerLock) {
        if (event.type != "mousemove" && "mozMovementX" in event) {
          Browser.mouseMovementX = Browser.mouseMovementY = 0;
        } else {
          Browser.mouseMovementX = Browser.getMovementX(event);
          Browser.mouseMovementY = Browser.getMovementY(event);
        }
        if (typeof SDL != "undefined") {
          Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
          Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
        } else {
          Browser.mouseX += Browser.mouseMovementX;
          Browser.mouseY += Browser.mouseMovementY;
        }
      } else {
        var rect = Module["canvas"].getBoundingClientRect();
        var cw = Module["canvas"].width;
        var ch = Module["canvas"].height;
        var scrollX =
          typeof window.scrollX !== "undefined"
            ? window.scrollX
            : window.pageXOffset;
        var scrollY =
          typeof window.scrollY !== "undefined"
            ? window.scrollY
            : window.pageYOffset;
        if (
          event.type === "touchstart" ||
          event.type === "touchend" ||
          event.type === "touchmove"
        ) {
          var touch = event.touch;
          if (touch === undefined) {
            return;
          }
          var adjustedX = touch.pageX - (scrollX + rect.left);
          var adjustedY = touch.pageY - (scrollY + rect.top);
          adjustedX = adjustedX * (cw / rect.width);
          adjustedY = adjustedY * (ch / rect.height);
          var coords = {
            x: adjustedX,
            y: adjustedY,
          };
          if (event.type === "touchstart") {
            Browser.lastTouches[touch.identifier] = coords;
            Browser.touches[touch.identifier] = coords;
          } else if (event.type === "touchend" || event.type === "touchmove") {
            var last = Browser.touches[touch.identifier];
            if (!last) last = coords;
            Browser.lastTouches[touch.identifier] = last;
            Browser.touches[touch.identifier] = coords;
          }
          return;
        }
        var x = event.pageX - (scrollX + rect.left);
        var y = event.pageY - (scrollY + rect.top);
        x = x * (cw / rect.width);
        y = y * (ch / rect.height);
        Browser.mouseMovementX = x - Browser.mouseX;
        Browser.mouseMovementY = y - Browser.mouseY;
        Browser.mouseX = x;
        Browser.mouseY = y;
      }
    },
    asyncLoad: function (url, onload, onerror, noRunDep) {
      var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
      readAsync(
        url,
        function (arrayBuffer) {
          assert(
            arrayBuffer,
            'Loading data file "' + url + '" failed (no arrayBuffer).'
          );
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        function (event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        }
      );
      if (dep) addRunDependency(dep);
    },
    resizeListeners: [],
    updateResizeListeners: function () {
      var canvas = Module["canvas"];
      Browser.resizeListeners.forEach(function (listener) {
        listener(canvas.width, canvas.height);
      });
    },
    setCanvasSize: function (width, height, noUpdates) {
      var canvas = Module["canvas"];
      Browser.updateCanvasDimensions(canvas, width, height);
      if (!noUpdates) Browser.updateResizeListeners();
    },
    windowedWidth: 0,
    windowedHeight: 0,
    setFullscreenCanvasSize: function () {
      if (typeof SDL != "undefined") {
        var flags = HEAPU32[SDL.screen >> 2];
        flags = flags | 8388608;
        HEAP32[SDL.screen >> 2] = flags;
      }
      Browser.updateCanvasDimensions(Module["canvas"]);
      Browser.updateResizeListeners();
    },
    setWindowedCanvasSize: function () {
      if (typeof SDL != "undefined") {
        var flags = HEAPU32[SDL.screen >> 2];
        flags = flags & ~8388608;
        HEAP32[SDL.screen >> 2] = flags;
      }
      Browser.updateCanvasDimensions(Module["canvas"]);
      Browser.updateResizeListeners();
    },
    updateCanvasDimensions: function (canvas, wNative, hNative) {
      if (wNative && hNative) {
        canvas.widthNative = wNative;
        canvas.heightNative = hNative;
      } else {
        wNative = canvas.widthNative;
        hNative = canvas.heightNative;
      }
      var w = wNative;
      var h = hNative;
      if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
        if (w / h < Module["forcedAspectRatio"]) {
          w = Math.round(h * Module["forcedAspectRatio"]);
        } else {
          h = Math.round(w / Module["forcedAspectRatio"]);
        }
      }
      if (
        (document["fullscreenElement"] ||
          document["mozFullScreenElement"] ||
          document["msFullscreenElement"] ||
          document["webkitFullscreenElement"] ||
          document["webkitCurrentFullScreenElement"]) === canvas.parentNode &&
        typeof screen != "undefined"
      ) {
        var factor = Math.min(screen.width / w, screen.height / h);
        w = Math.round(w * factor);
        h = Math.round(h * factor);
      }
      if (Browser.resizeCanvas) {
        if (canvas.width != w) canvas.width = w;
        if (canvas.height != h) canvas.height = h;
        if (typeof canvas.style != "undefined") {
          canvas.style.removeProperty("width");
          canvas.style.removeProperty("height");
        }
      } else {
        if (canvas.width != wNative) canvas.width = wNative;
        if (canvas.height != hNative) canvas.height = hNative;
        if (typeof canvas.style != "undefined") {
          if (w != wNative || h != hNative) {
            canvas.style.setProperty("width", w + "px", "important");
            canvas.style.setProperty("height", h + "px", "important");
          } else {
            canvas.style.removeProperty("width");
            canvas.style.removeProperty("height");
          }
        }
      }
    },
    wgetRequests: {},
    nextWgetRequestHandle: 0,
    getNextWgetRequestHandle: function () {
      var handle = Browser.nextWgetRequestHandle;
      Browser.nextWgetRequestHandle++;
      return handle;
    },
  };
  var EGL = {
    errorCode: 12288,
    defaultDisplayInitialized: false,
    currentContext: 0,
    currentReadSurface: 0,
    currentDrawSurface: 0,
    contextAttributes: {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
    },
    stringCache: {},
    setErrorCode: function (code) {
      EGL.errorCode = code;
    },
    chooseConfig: function (
      display,
      attribList,
      config,
      config_size,
      numConfigs
    ) {
      if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
      }
      if (attribList) {
        for (;;) {
          var param = HEAP32[attribList >> 2];
          if (param == 12321) {
            var alphaSize = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.alpha = alphaSize > 0;
          } else if (param == 12325) {
            var depthSize = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.depth = depthSize > 0;
          } else if (param == 12326) {
            var stencilSize = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.stencil = stencilSize > 0;
          } else if (param == 12337) {
            var samples = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.antialias = samples > 0;
          } else if (param == 12338) {
            var samples = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.antialias = samples == 1;
          } else if (param == 12544) {
            var requestedPriority = HEAP32[(attribList + 4) >> 2];
            EGL.contextAttributes.lowLatency = requestedPriority != 12547;
          } else if (param == 12344) {
            break;
          }
          attribList += 8;
        }
      }
      if ((!config || !config_size) && !numConfigs) {
        EGL.setErrorCode(12300);
        return 0;
      }
      if (numConfigs) {
        HEAP32[numConfigs >> 2] = 1;
      }
      if (config && config_size > 0) {
        HEAP32[config >> 2] = 62002;
      }
      EGL.setErrorCode(12288);
      return 1;
    },
  };
  function _eglBindAPI(api) {
    if (api == 12448) {
      EGL.setErrorCode(12288);
      return 1;
    } else {
      EGL.setErrorCode(12300);
      return 0;
    }
  }
  function _eglChooseConfig(
    display,
    attrib_list,
    configs,
    config_size,
    numConfigs
  ) {
    return EGL.chooseConfig(
      display,
      attrib_list,
      configs,
      config_size,
      numConfigs
    );
  }
  function __webgl_enable_ANGLE_instanced_arrays(ctx) {
    var ext = ctx.getExtension("ANGLE_instanced_arrays");
    if (ext) {
      ctx["vertexAttribDivisor"] = function (index, divisor) {
        ext["vertexAttribDivisorANGLE"](index, divisor);
      };
      ctx["drawArraysInstanced"] = function (mode, first, count, primcount) {
        ext["drawArraysInstancedANGLE"](mode, first, count, primcount);
      };
      ctx["drawElementsInstanced"] = function (
        mode,
        count,
        type,
        indices,
        primcount
      ) {
        ext["drawElementsInstancedANGLE"](
          mode,
          count,
          type,
          indices,
          primcount
        );
      };
      return 1;
    }
  }
  function __webgl_enable_OES_vertex_array_object(ctx) {
    var ext = ctx.getExtension("OES_vertex_array_object");
    if (ext) {
      ctx["createVertexArray"] = function () {
        return ext["createVertexArrayOES"]();
      };
      ctx["deleteVertexArray"] = function (vao) {
        ext["deleteVertexArrayOES"](vao);
      };
      ctx["bindVertexArray"] = function (vao) {
        ext["bindVertexArrayOES"](vao);
      };
      ctx["isVertexArray"] = function (vao) {
        return ext["isVertexArrayOES"](vao);
      };
      return 1;
    }
  }
  function __webgl_enable_WEBGL_draw_buffers(ctx) {
    var ext = ctx.getExtension("WEBGL_draw_buffers");
    if (ext) {
      ctx["drawBuffers"] = function (n, bufs) {
        ext["drawBuffersWEBGL"](n, bufs);
      };
      return 1;
    }
  }
  function __webgl_enable_WEBGL_multi_draw(ctx) {
    return !!(ctx.multiDrawWebgl = ctx.getExtension("WEBGL_multi_draw"));
  }
  var GL = {
    counter: 1,
    buffers: [],
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    shaders: [],
    vaos: [],
    contexts: [],
    offscreenCanvases: {},
    queries: [],
    stringCache: {},
    unpackAlignment: 4,
    recordError: function recordError(errorCode) {
      if (!GL.lastError) {
        GL.lastError = errorCode;
      }
    },
    getNewId: function (table) {
      var ret = GL.counter++;
      for (var i = table.length; i < ret; i++) {
        table[i] = null;
      }
      return ret;
    },
    getSource: function (shader, count, string, length) {
      var source = "";
      for (var i = 0; i < count; ++i) {
        var len = length ? HEAP32[(length + i * 4) >> 2] : -1;
        source += UTF8ToString(
          HEAP32[(string + i * 4) >> 2],
          len < 0 ? undefined : len
        );
      }
      return source;
    },
    createContext: function (canvas, webGLContextAttributes) {
      if (!canvas.getContextSafariWebGL2Fixed) {
        canvas.getContextSafariWebGL2Fixed = canvas.getContext;
        canvas.getContext = function (ver, attrs) {
          var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
          return (ver == "webgl") == gl instanceof WebGLRenderingContext
            ? gl
            : null;
        };
      }
      var ctx = canvas.getContext("webgl", webGLContextAttributes);
      if (!ctx) return 0;
      var handle = GL.registerContext(ctx, webGLContextAttributes);
      return handle;
    },
    registerContext: function (ctx, webGLContextAttributes) {
      var handle = GL.getNewId(GL.contexts);
      var context = {
        handle: handle,
        attributes: webGLContextAttributes,
        version: webGLContextAttributes.majorVersion,
        GLctx: ctx,
      };
      if (ctx.canvas) ctx.canvas.GLctxObject = context;
      GL.contexts[handle] = context;
      if (
        typeof webGLContextAttributes.enableExtensionsByDefault ===
          "undefined" ||
        webGLContextAttributes.enableExtensionsByDefault
      ) {
        GL.initExtensions(context);
      }
      return handle;
    },
    makeContextCurrent: function (contextHandle) {
      GL.currentContext = GL.contexts[contextHandle];
      Module.ctx = GLctx = GL.currentContext && GL.currentContext.GLctx;
      return !(contextHandle && !GLctx);
    },
    getContext: function (contextHandle) {
      return GL.contexts[contextHandle];
    },
    deleteContext: function (contextHandle) {
      if (GL.currentContext === GL.contexts[contextHandle])
        GL.currentContext = null;
      if (typeof JSEvents === "object")
        JSEvents.removeAllHandlersOnTarget(
          GL.contexts[contextHandle].GLctx.canvas
        );
      if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas)
        GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
      GL.contexts[contextHandle] = null;
    },
    initExtensions: function (context) {
      if (!context) context = GL.currentContext;
      if (context.initExtensionsDone) return;
      context.initExtensionsDone = true;
      var GLctx = context.GLctx;
      __webgl_enable_ANGLE_instanced_arrays(GLctx);
      __webgl_enable_OES_vertex_array_object(GLctx);
      __webgl_enable_WEBGL_draw_buffers(GLctx);
      {
        GLctx.disjointTimerQueryExt = GLctx.getExtension(
          "EXT_disjoint_timer_query"
        );
      }
      __webgl_enable_WEBGL_multi_draw(GLctx);
      var exts = GLctx.getSupportedExtensions() || [];
      exts.forEach(function (ext) {
        if (!ext.includes("lose_context") && !ext.includes("debug")) {
          GLctx.getExtension(ext);
        }
      });
    },
  };
  function _eglCreateContext(display, config, hmm, contextAttribs) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    var glesContextVersion = 1;
    for (;;) {
      var param = HEAP32[contextAttribs >> 2];
      if (param == 12440) {
        glesContextVersion = HEAP32[(contextAttribs + 4) >> 2];
      } else if (param == 12344) {
        break;
      } else {
        EGL.setErrorCode(12292);
        return 0;
      }
      contextAttribs += 8;
    }
    if (glesContextVersion != 2) {
      EGL.setErrorCode(12293);
      return 0;
    }
    EGL.contextAttributes.majorVersion = glesContextVersion - 1;
    EGL.contextAttributes.minorVersion = 0;
    EGL.context = GL.createContext(Module["canvas"], EGL.contextAttributes);
    if (EGL.context != 0) {
      EGL.setErrorCode(12288);
      GL.makeContextCurrent(EGL.context);
      Module.useWebGL = true;
      Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
        callback();
      });
      GL.makeContextCurrent(null);
      return 62004;
    } else {
      EGL.setErrorCode(12297);
      return 0;
    }
  }
  function _eglCreateWindowSurface(display, config, win, attrib_list) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (config != 62002) {
      EGL.setErrorCode(12293);
      return 0;
    }
    EGL.setErrorCode(12288);
    return 62006;
  }
  function _eglDestroyContext(display, context) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (context != 62004) {
      EGL.setErrorCode(12294);
      return 0;
    }
    GL.deleteContext(EGL.context);
    EGL.setErrorCode(12288);
    if (EGL.currentContext == context) {
      EGL.currentContext = 0;
    }
    return 1;
  }
  function _eglDestroySurface(display, surface) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (surface != 62006) {
      EGL.setErrorCode(12301);
      return 1;
    }
    if (EGL.currentReadSurface == surface) {
      EGL.currentReadSurface = 0;
    }
    if (EGL.currentDrawSurface == surface) {
      EGL.currentDrawSurface = 0;
    }
    EGL.setErrorCode(12288);
    return 1;
  }
  function _eglGetConfigAttrib(display, config, attribute, value) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (config != 62002) {
      EGL.setErrorCode(12293);
      return 0;
    }
    if (!value) {
      EGL.setErrorCode(12300);
      return 0;
    }
    EGL.setErrorCode(12288);
    switch (attribute) {
      case 12320:
        HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 32 : 24;
        return 1;
      case 12321:
        HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 8 : 0;
        return 1;
      case 12322:
        HEAP32[value >> 2] = 8;
        return 1;
      case 12323:
        HEAP32[value >> 2] = 8;
        return 1;
      case 12324:
        HEAP32[value >> 2] = 8;
        return 1;
      case 12325:
        HEAP32[value >> 2] = EGL.contextAttributes.depth ? 24 : 0;
        return 1;
      case 12326:
        HEAP32[value >> 2] = EGL.contextAttributes.stencil ? 8 : 0;
        return 1;
      case 12327:
        HEAP32[value >> 2] = 12344;
        return 1;
      case 12328:
        HEAP32[value >> 2] = 62002;
        return 1;
      case 12329:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12330:
        HEAP32[value >> 2] = 4096;
        return 1;
      case 12331:
        HEAP32[value >> 2] = 16777216;
        return 1;
      case 12332:
        HEAP32[value >> 2] = 4096;
        return 1;
      case 12333:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12334:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12335:
        HEAP32[value >> 2] = 12344;
        return 1;
      case 12337:
        HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 4 : 0;
        return 1;
      case 12338:
        HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 1 : 0;
        return 1;
      case 12339:
        HEAP32[value >> 2] = 4;
        return 1;
      case 12340:
        HEAP32[value >> 2] = 12344;
        return 1;
      case 12341:
      case 12342:
      case 12343:
        HEAP32[value >> 2] = -1;
        return 1;
      case 12345:
      case 12346:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12347:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12348:
        HEAP32[value >> 2] = 1;
        return 1;
      case 12349:
      case 12350:
        HEAP32[value >> 2] = 0;
        return 1;
      case 12351:
        HEAP32[value >> 2] = 12430;
        return 1;
      case 12352:
        HEAP32[value >> 2] = 4;
        return 1;
      case 12354:
        HEAP32[value >> 2] = 0;
        return 1;
      default:
        EGL.setErrorCode(12292);
        return 0;
    }
  }
  function _eglGetDisplay(nativeDisplayType) {
    EGL.setErrorCode(12288);
    return 62e3;
  }
  function _eglGetError() {
    return EGL.errorCode;
  }
  function _eglInitialize(display, majorVersion, minorVersion) {
    if (display == 62e3) {
      if (majorVersion) {
        HEAP32[majorVersion >> 2] = 1;
      }
      if (minorVersion) {
        HEAP32[minorVersion >> 2] = 4;
      }
      EGL.defaultDisplayInitialized = true;
      EGL.setErrorCode(12288);
      return 1;
    } else {
      EGL.setErrorCode(12296);
      return 0;
    }
  }
  function _eglMakeCurrent(display, draw, read, context) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (context != 0 && context != 62004) {
      EGL.setErrorCode(12294);
      return 0;
    }
    if ((read != 0 && read != 62006) || (draw != 0 && draw != 62006)) {
      EGL.setErrorCode(12301);
      return 0;
    }
    GL.makeContextCurrent(context ? EGL.context : null);
    EGL.currentContext = context;
    EGL.currentDrawSurface = draw;
    EGL.currentReadSurface = read;
    EGL.setErrorCode(12288);
    return 1;
  }
  function _eglQueryString(display, name) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    EGL.setErrorCode(12288);
    if (EGL.stringCache[name]) return EGL.stringCache[name];
    var ret;
    switch (name) {
      case 12371:
        ret = allocateUTF8("Emscripten");
        break;
      case 12372:
        ret = allocateUTF8("1.4 Emscripten EGL");
        break;
      case 12373:
        ret = allocateUTF8("");
        break;
      case 12429:
        ret = allocateUTF8("OpenGL_ES");
        break;
      default:
        EGL.setErrorCode(12300);
        return 0;
    }
    EGL.stringCache[name] = ret;
    return ret;
  }
  function _eglSwapBuffers() {
    if (!EGL.defaultDisplayInitialized) {
      EGL.setErrorCode(12289);
    } else if (!Module.ctx) {
      EGL.setErrorCode(12290);
    } else if (Module.ctx.isContextLost()) {
      EGL.setErrorCode(12302);
    } else {
      EGL.setErrorCode(12288);
      return 1;
    }
    return 0;
  }
  function _eglSwapInterval(display, interval) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    if (interval == 0) _emscripten_set_main_loop_timing(0, 0);
    else _emscripten_set_main_loop_timing(1, interval);
    EGL.setErrorCode(12288);
    return 1;
  }
  function _eglTerminate(display) {
    if (display != 62e3) {
      EGL.setErrorCode(12296);
      return 0;
    }
    EGL.currentContext = 0;
    EGL.currentReadSurface = 0;
    EGL.currentDrawSurface = 0;
    EGL.defaultDisplayInitialized = false;
    EGL.setErrorCode(12288);
    return 1;
  }
  function _eglWaitClient() {
    EGL.setErrorCode(12288);
    return 1;
  }
  function _eglWaitGL() {
    return _eglWaitClient();
  }
  function _eglWaitNative(nativeEngineId) {
    EGL.setErrorCode(12288);
    return 1;
  }
  var readAsmConstArgsArray = [];
  function readAsmConstArgs(sigPtr, buf) {
    readAsmConstArgsArray.length = 0;
    var ch;
    buf >>= 2;
    while ((ch = HEAPU8[sigPtr++])) {
      var double = ch < 105;
      if (double && buf & 1) buf++;
      readAsmConstArgsArray.push(double ? HEAPF64[buf++ >> 1] : HEAP32[buf]);
      ++buf;
    }
    return readAsmConstArgsArray;
  }
  function _emscripten_asm_const_int(code, sigPtr, argbuf) {
    var args = readAsmConstArgs(sigPtr, argbuf);
    return ASM_CONSTS[code].apply(null, args);
  }
  var JSEvents = {
    inEventHandler: 0,
    removeAllEventListeners: function () {
      for (var i = JSEvents.eventHandlers.length - 1; i >= 0; --i) {
        JSEvents._removeHandler(i);
      }
      JSEvents.eventHandlers = [];
      JSEvents.deferredCalls = [];
    },
    registerRemoveEventListeners: function () {
      if (!JSEvents.removeEventListenersRegistered) {
        __ATEXIT__.push(JSEvents.removeAllEventListeners);
        JSEvents.removeEventListenersRegistered = true;
      }
    },
    deferredCalls: [],
    deferCall: function (targetFunction, precedence, argsList) {
      function arraysHaveEqualContent(arrA, arrB) {
        if (arrA.length != arrB.length) return false;
        for (var i in arrA) {
          if (arrA[i] != arrB[i]) return false;
        }
        return true;
      }
      for (var i in JSEvents.deferredCalls) {
        var call = JSEvents.deferredCalls[i];
        if (
          call.targetFunction == targetFunction &&
          arraysHaveEqualContent(call.argsList, argsList)
        ) {
          return;
        }
      }
      JSEvents.deferredCalls.push({
        targetFunction: targetFunction,
        precedence: precedence,
        argsList: argsList,
      });
      JSEvents.deferredCalls.sort(function (x, y) {
        return x.precedence < y.precedence;
      });
    },
    removeDeferredCalls: function (targetFunction) {
      for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
        if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
          JSEvents.deferredCalls.splice(i, 1);
          --i;
        }
      }
    },
    canPerformEventHandlerRequests: function () {
      return (
        JSEvents.inEventHandler &&
        JSEvents.currentEventHandler.allowsDeferredCalls
      );
    },
    runDeferredCalls: function () {
      if (!JSEvents.canPerformEventHandlerRequests()) {
        return;
      }
      for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
        var call = JSEvents.deferredCalls[i];
        JSEvents.deferredCalls.splice(i, 1);
        --i;
        call.targetFunction.apply(null, call.argsList);
      }
    },
    eventHandlers: [],
    removeAllHandlersOnTarget: function (target, eventTypeString) {
      for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
        if (
          JSEvents.eventHandlers[i].target == target &&
          (!eventTypeString ||
            eventTypeString == JSEvents.eventHandlers[i].eventTypeString)
        ) {
          JSEvents._removeHandler(i--);
        }
      }
    },
    _removeHandler: function (i) {
      var h = JSEvents.eventHandlers[i];
      h.target.removeEventListener(
        h.eventTypeString,
        h.eventListenerFunc,
        h.useCapture
      );
      JSEvents.eventHandlers.splice(i, 1);
    },
    registerOrRemoveHandler: function (eventHandler) {
      var jsEventHandler = function jsEventHandler(event) {
        ++JSEvents.inEventHandler;
        JSEvents.currentEventHandler = eventHandler;
        JSEvents.runDeferredCalls();
        eventHandler.handlerFunc(event);
        JSEvents.runDeferredCalls();
        --JSEvents.inEventHandler;
      };
      if (eventHandler.callbackfunc) {
        eventHandler.eventListenerFunc = jsEventHandler;
        eventHandler.target.addEventListener(
          eventHandler.eventTypeString,
          jsEventHandler,
          eventHandler.useCapture
        );
        JSEvents.eventHandlers.push(eventHandler);
        JSEvents.registerRemoveEventListeners();
      } else {
        for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
          if (
            JSEvents.eventHandlers[i].target == eventHandler.target &&
            JSEvents.eventHandlers[i].eventTypeString ==
              eventHandler.eventTypeString
          ) {
            JSEvents._removeHandler(i--);
          }
        }
      }
    },
    getNodeNameForTarget: function (target) {
      if (!target) return "";
      if (target == window) return "#window";
      if (target == screen) return "#screen";
      return target && target.nodeName ? target.nodeName : "";
    },
    fullscreenEnabled: function () {
      return document.fullscreenEnabled || document.webkitFullscreenEnabled;
    },
  };
  var currentFullscreenStrategy = {};
  function maybeCStringToJsString(cString) {
    return cString > 2 ? UTF8ToString(cString) : cString;
  }
  var specialHTMLTargets = [
    0,
    typeof document !== "undefined" ? document : 0,
    typeof window !== "undefined" ? window : 0,
  ];
  function findEventTarget(target) {
    target = maybeCStringToJsString(target);
    var domElement =
      specialHTMLTargets[target] ||
      (typeof document !== "undefined"
        ? document.querySelector(target)
        : undefined);
    return domElement;
  }
  function findCanvasEventTarget(target) {
    return findEventTarget(target);
  }
  function _emscripten_get_canvas_element_size(target, width, height) {
    var canvas = findCanvasEventTarget(target);
    if (!canvas) return -4;
    HEAP32[width >> 2] = canvas.width;
    HEAP32[height >> 2] = canvas.height;
  }
  function getCanvasElementSize(target) {
    var stackTop = stackSave();
    var w = stackAlloc(8);
    var h = w + 4;
    var targetInt = stackAlloc(target.id.length + 1);
    stringToUTF8(target.id, targetInt, target.id.length + 1);
    var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
    var size = [HEAP32[w >> 2], HEAP32[h >> 2]];
    stackRestore(stackTop);
    return size;
  }
  function _emscripten_set_canvas_element_size(target, width, height) {
    var canvas = findCanvasEventTarget(target);
    if (!canvas) return -4;
    canvas.width = width;
    canvas.height = height;
    return 0;
  }
  function setCanvasElementSize(target, width, height) {
    if (!target.controlTransferredOffscreen) {
      target.width = width;
      target.height = height;
    } else {
      var stackTop = stackSave();
      var targetInt = stackAlloc(target.id.length + 1);
      stringToUTF8(target.id, targetInt, target.id.length + 1);
      _emscripten_set_canvas_element_size(targetInt, width, height);
      stackRestore(stackTop);
    }
  }
  function registerRestoreOldStyle(canvas) {
    var canvasSize = getCanvasElementSize(canvas);
    var oldWidth = canvasSize[0];
    var oldHeight = canvasSize[1];
    var oldCssWidth = canvas.style.width;
    var oldCssHeight = canvas.style.height;
    var oldBackgroundColor = canvas.style.backgroundColor;
    var oldDocumentBackgroundColor = document.body.style.backgroundColor;
    var oldPaddingLeft = canvas.style.paddingLeft;
    var oldPaddingRight = canvas.style.paddingRight;
    var oldPaddingTop = canvas.style.paddingTop;
    var oldPaddingBottom = canvas.style.paddingBottom;
    var oldMarginLeft = canvas.style.marginLeft;
    var oldMarginRight = canvas.style.marginRight;
    var oldMarginTop = canvas.style.marginTop;
    var oldMarginBottom = canvas.style.marginBottom;
    var oldDocumentBodyMargin = document.body.style.margin;
    var oldDocumentOverflow = document.documentElement.style.overflow;
    var oldDocumentScroll = document.body.scroll;
    var oldImageRendering = canvas.style.imageRendering;
    function restoreOldStyle() {
      var fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;
      if (!fullscreenElement) {
        document.removeEventListener("fullscreenchange", restoreOldStyle);
        document.removeEventListener("webkitfullscreenchange", restoreOldStyle);
        setCanvasElementSize(canvas, oldWidth, oldHeight);
        canvas.style.width = oldCssWidth;
        canvas.style.height = oldCssHeight;
        canvas.style.backgroundColor = oldBackgroundColor;
        if (!oldDocumentBackgroundColor)
          document.body.style.backgroundColor = "white";
        document.body.style.backgroundColor = oldDocumentBackgroundColor;
        canvas.style.paddingLeft = oldPaddingLeft;
        canvas.style.paddingRight = oldPaddingRight;
        canvas.style.paddingTop = oldPaddingTop;
        canvas.style.paddingBottom = oldPaddingBottom;
        canvas.style.marginLeft = oldMarginLeft;
        canvas.style.marginRight = oldMarginRight;
        canvas.style.marginTop = oldMarginTop;
        canvas.style.marginBottom = oldMarginBottom;
        document.body.style.margin = oldDocumentBodyMargin;
        document.documentElement.style.overflow = oldDocumentOverflow;
        document.body.scroll = oldDocumentScroll;
        canvas.style.imageRendering = oldImageRendering;
        if (canvas.GLctxObject)
          canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);
        if (currentFullscreenStrategy.canvasResizedCallback) {
          wasmTable.get(currentFullscreenStrategy.canvasResizedCallback)(
            37,
            0,
            currentFullscreenStrategy.canvasResizedCallbackUserData
          );
        }
      }
    }
    document.addEventListener("fullscreenchange", restoreOldStyle);
    document.addEventListener("webkitfullscreenchange", restoreOldStyle);
    return restoreOldStyle;
  }
  function setLetterbox(element, topBottom, leftRight) {
    element.style.paddingLeft = element.style.paddingRight = leftRight + "px";
    element.style.paddingTop = element.style.paddingBottom = topBottom + "px";
  }
  function getBoundingClientRect(e) {
    return specialHTMLTargets.indexOf(e) < 0
      ? e.getBoundingClientRect()
      : {
          left: 0,
          top: 0,
        };
  }
  function _JSEvents_resizeCanvasForFullscreen(target, strategy) {
    var restoreOldStyle = registerRestoreOldStyle(target);
    var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
    var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
    var rect = getBoundingClientRect(target);
    var windowedCssWidth = rect.width;
    var windowedCssHeight = rect.height;
    var canvasSize = getCanvasElementSize(target);
    var windowedRttWidth = canvasSize[0];
    var windowedRttHeight = canvasSize[1];
    if (strategy.scaleMode == 3) {
      setLetterbox(
        target,
        (cssHeight - windowedCssHeight) / 2,
        (cssWidth - windowedCssWidth) / 2
      );
      cssWidth = windowedCssWidth;
      cssHeight = windowedCssHeight;
    } else if (strategy.scaleMode == 2) {
      if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
        var desiredCssHeight =
          (windowedRttHeight * cssWidth) / windowedRttWidth;
        setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
        cssHeight = desiredCssHeight;
      } else {
        var desiredCssWidth =
          (windowedRttWidth * cssHeight) / windowedRttHeight;
        setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
        cssWidth = desiredCssWidth;
      }
    }
    if (!target.style.backgroundColor) target.style.backgroundColor = "black";
    if (!document.body.style.backgroundColor)
      document.body.style.backgroundColor = "black";
    target.style.width = cssWidth + "px";
    target.style.height = cssHeight + "px";
    if (strategy.filteringMode == 1) {
      target.style.imageRendering = "optimizeSpeed";
      target.style.imageRendering = "-moz-crisp-edges";
      target.style.imageRendering = "-o-crisp-edges";
      target.style.imageRendering = "-webkit-optimize-contrast";
      target.style.imageRendering = "optimize-contrast";
      target.style.imageRendering = "crisp-edges";
      target.style.imageRendering = "pixelated";
    }
    var dpiScale =
      strategy.canvasResolutionScaleMode == 2 ? devicePixelRatio : 1;
    if (strategy.canvasResolutionScaleMode != 0) {
      var newWidth = (cssWidth * dpiScale) | 0;
      var newHeight = (cssHeight * dpiScale) | 0;
      setCanvasElementSize(target, newWidth, newHeight);
      if (target.GLctxObject)
        target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight);
    }
    return restoreOldStyle;
  }
  function _JSEvents_requestFullscreen(target, strategy) {
    if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
      _JSEvents_resizeCanvasForFullscreen(target, strategy);
    }
    if (target.requestFullscreen) {
      target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else {
      return JSEvents.fullscreenEnabled() ? -3 : -1;
    }
    currentFullscreenStrategy = strategy;
    if (strategy.canvasResizedCallback) {
      wasmTable.get(strategy.canvasResizedCallback)(
        37,
        0,
        strategy.canvasResizedCallbackUserData
      );
    }
    return 0;
  }
  function _emscripten_exit_fullscreen() {
    if (!JSEvents.fullscreenEnabled()) return -1;
    JSEvents.removeDeferredCalls(_JSEvents_requestFullscreen);
    var d = specialHTMLTargets[1];
    if (d.exitFullscreen) {
      d.fullscreenElement && d.exitFullscreen();
    } else if (d.webkitExitFullscreen) {
      d.webkitFullscreenElement && d.webkitExitFullscreen();
    } else {
      return -1;
    }
    return 0;
  }
  function requestPointerLock(target) {
    if (target.requestPointerLock) {
      target.requestPointerLock();
    } else if (target.msRequestPointerLock) {
      target.msRequestPointerLock();
    } else {
      if (
        document.body.requestPointerLock ||
        document.body.msRequestPointerLock
      ) {
        return -3;
      } else {
        return -1;
      }
    }
    return 0;
  }
  function _emscripten_exit_pointerlock() {
    JSEvents.removeDeferredCalls(requestPointerLock);
    if (document.exitPointerLock) {
      document.exitPointerLock();
    } else if (document.msExitPointerLock) {
      document.msExitPointerLock();
    } else {
      return -1;
    }
    return 0;
  }
  function _emscripten_get_device_pixel_ratio() {
    return (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
  }
  function _emscripten_get_element_css_size(target, width, height) {
    target = findEventTarget(target);
    if (!target) return -4;
    var rect = getBoundingClientRect(target);
    HEAPF64[width >> 3] = rect.width;
    HEAPF64[height >> 3] = rect.height;
    return 0;
  }
  function fillGamepadEventData(eventStruct, e) {
    HEAPF64[eventStruct >> 3] = e.timestamp;
    for (var i = 0; i < e.axes.length; ++i) {
      HEAPF64[(eventStruct + i * 8 + 16) >> 3] = e.axes[i];
    }
    for (var i = 0; i < e.buttons.length; ++i) {
      if (typeof e.buttons[i] === "object") {
        HEAPF64[(eventStruct + i * 8 + 528) >> 3] = e.buttons[i].value;
      } else {
        HEAPF64[(eventStruct + i * 8 + 528) >> 3] = e.buttons[i];
      }
    }
    for (var i = 0; i < e.buttons.length; ++i) {
      if (typeof e.buttons[i] === "object") {
        HEAP32[(eventStruct + i * 4 + 1040) >> 2] = e.buttons[i].pressed;
      } else {
        HEAP32[(eventStruct + i * 4 + 1040) >> 2] = e.buttons[i] == 1;
      }
    }
    HEAP32[(eventStruct + 1296) >> 2] = e.connected;
    HEAP32[(eventStruct + 1300) >> 2] = e.index;
    HEAP32[(eventStruct + 8) >> 2] = e.axes.length;
    HEAP32[(eventStruct + 12) >> 2] = e.buttons.length;
    stringToUTF8(e.id, eventStruct + 1304, 64);
    stringToUTF8(e.mapping, eventStruct + 1368, 64);
  }
  function _emscripten_get_gamepad_status(index, gamepadState) {
    if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;
    if (!JSEvents.lastGamepadState[index]) return -7;
    fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
    return 0;
  }
  function _emscripten_get_num_gamepads() {
    return JSEvents.lastGamepadState.length;
  }
  function _emscripten_glActiveTexture(x0) {
    GLctx["activeTexture"](x0);
  }
  function _emscripten_glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
  }
  function _emscripten_glBeginQueryEXT(target, id) {
    GLctx.disjointTimerQueryExt["beginQueryEXT"](target, GL.queries[id]);
  }
  function _emscripten_glBindAttribLocation(program, index, name) {
    GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
  }
  function _emscripten_glBindBuffer(target, buffer) {
    GLctx.bindBuffer(target, GL.buffers[buffer]);
  }
  function _emscripten_glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
  }
  function _emscripten_glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
  }
  function _emscripten_glBindTexture(target, texture) {
    GLctx.bindTexture(target, GL.textures[texture]);
  }
  function _emscripten_glBindVertexArrayOES(vao) {
    GLctx["bindVertexArray"](GL.vaos[vao]);
  }
  function _emscripten_glBlendColor(x0, x1, x2, x3) {
    GLctx["blendColor"](x0, x1, x2, x3);
  }
  function _emscripten_glBlendEquation(x0) {
    GLctx["blendEquation"](x0);
  }
  function _emscripten_glBlendEquationSeparate(x0, x1) {
    GLctx["blendEquationSeparate"](x0, x1);
  }
  function _emscripten_glBlendFunc(x0, x1) {
    GLctx["blendFunc"](x0, x1);
  }
  function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) {
    GLctx["blendFuncSeparate"](x0, x1, x2, x3);
  }
  function _emscripten_glBufferData(target, size, data, usage) {
    GLctx.bufferData(
      target,
      data ? HEAPU8.subarray(data, data + size) : size,
      usage
    );
  }
  function _emscripten_glBufferSubData(target, offset, size, data) {
    GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
  }
  function _emscripten_glCheckFramebufferStatus(x0) {
    return GLctx["checkFramebufferStatus"](x0);
  }
  function _emscripten_glClear(x0) {
    GLctx["clear"](x0);
  }
  function _emscripten_glClearColor(x0, x1, x2, x3) {
    GLctx["clearColor"](x0, x1, x2, x3);
  }
  function _emscripten_glClearDepthf(x0) {
    GLctx["clearDepth"](x0);
  }
  function _emscripten_glClearStencil(x0) {
    GLctx["clearStencil"](x0);
  }
  function _emscripten_glColorMask(red, green, blue, alpha) {
    GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
  }
  function _emscripten_glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader]);
  }
  function _emscripten_glCompressedTexImage2D(
    target,
    level,
    internalFormat,
    width,
    height,
    border,
    imageSize,
    data
  ) {
    GLctx["compressedTexImage2D"](
      target,
      level,
      internalFormat,
      width,
      height,
      border,
      data ? HEAPU8.subarray(data, data + imageSize) : null
    );
  }
  function _emscripten_glCompressedTexSubImage2D(
    target,
    level,
    xoffset,
    yoffset,
    width,
    height,
    format,
    imageSize,
    data
  ) {
    GLctx["compressedTexSubImage2D"](
      target,
      level,
      xoffset,
      yoffset,
      width,
      height,
      format,
      data ? HEAPU8.subarray(data, data + imageSize) : null
    );
  }
  function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
  }
  function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexSubImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
  }
  function _emscripten_glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    program.maxUniformLength =
      program.maxAttributeLength =
      program.maxUniformBlockNameLength =
        0;
    program.uniformIdCounter = 1;
    GL.programs[id] = program;
    return id;
  }
  function _emscripten_glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id;
  }
  function _emscripten_glCullFace(x0) {
    GLctx["cullFace"](x0);
  }
  function _emscripten_glDeleteBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
      var id = HEAP32[(buffers + i * 4) >> 2];
      var buffer = GL.buffers[id];
      if (!buffer) continue;
      GLctx.deleteBuffer(buffer);
      buffer.name = 0;
      GL.buffers[id] = null;
    }
  }
  function _emscripten_glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
      var id = HEAP32[(framebuffers + i * 4) >> 2];
      var framebuffer = GL.framebuffers[id];
      if (!framebuffer) continue;
      GLctx.deleteFramebuffer(framebuffer);
      framebuffer.name = 0;
      GL.framebuffers[id] = null;
    }
  }
  function _emscripten_glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
      GL.recordError(1281);
      return;
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
  }
  function _emscripten_glDeleteQueriesEXT(n, ids) {
    for (var i = 0; i < n; i++) {
      var id = HEAP32[(ids + i * 4) >> 2];
      var query = GL.queries[id];
      if (!query) continue;
      GLctx.disjointTimerQueryExt["deleteQueryEXT"](query);
      GL.queries[id] = null;
    }
  }
  function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
      var id = HEAP32[(renderbuffers + i * 4) >> 2];
      var renderbuffer = GL.renderbuffers[id];
      if (!renderbuffer) continue;
      GLctx.deleteRenderbuffer(renderbuffer);
      renderbuffer.name = 0;
      GL.renderbuffers[id] = null;
    }
  }
  function _emscripten_glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
      GL.recordError(1281);
      return;
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null;
  }
  function _emscripten_glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
      var id = HEAP32[(textures + i * 4) >> 2];
      var texture = GL.textures[id];
      if (!texture) continue;
      GLctx.deleteTexture(texture);
      texture.name = 0;
      GL.textures[id] = null;
    }
  }
  function _emscripten_glDeleteVertexArraysOES(n, vaos) {
    for (var i = 0; i < n; i++) {
      var id = HEAP32[(vaos + i * 4) >> 2];
      GLctx["deleteVertexArray"](GL.vaos[id]);
      GL.vaos[id] = null;
    }
  }
  function _emscripten_glDepthFunc(x0) {
    GLctx["depthFunc"](x0);
  }
  function _emscripten_glDepthMask(flag) {
    GLctx.depthMask(!!flag);
  }
  function _emscripten_glDepthRangef(x0, x1) {
    GLctx["depthRange"](x0, x1);
  }
  function _emscripten_glDetachShader(program, shader) {
    GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
  }
  function _emscripten_glDisable(x0) {
    GLctx["disable"](x0);
  }
  function _emscripten_glDisableVertexAttribArray(index) {
    GLctx.disableVertexAttribArray(index);
  }
  function _emscripten_glDrawArrays(mode, first, count) {
    GLctx.drawArrays(mode, first, count);
  }
  function _emscripten_glDrawArraysInstancedANGLE(
    mode,
    first,
    count,
    primcount
  ) {
    GLctx["drawArraysInstanced"](mode, first, count, primcount);
  }
  var tempFixedLengthArray = [];
  function _emscripten_glDrawBuffersWEBGL(n, bufs) {
    var bufArray = tempFixedLengthArray[n];
    for (var i = 0; i < n; i++) {
      bufArray[i] = HEAP32[(bufs + i * 4) >> 2];
    }
    GLctx["drawBuffers"](bufArray);
  }
  function _emscripten_glDrawElements(mode, count, type, indices) {
    GLctx.drawElements(mode, count, type, indices);
  }
  function _emscripten_glDrawElementsInstancedANGLE(
    mode,
    count,
    type,
    indices,
    primcount
  ) {
    GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
  }
  function _emscripten_glEnable(x0) {
    GLctx["enable"](x0);
  }
  function _emscripten_glEnableVertexAttribArray(index) {
    GLctx.enableVertexAttribArray(index);
  }
  function _emscripten_glEndQueryEXT(target) {
    GLctx.disjointTimerQueryExt["endQueryEXT"](target);
  }
  function _emscripten_glFinish() {
    GLctx["finish"]();
  }
  function _emscripten_glFlush() {
    GLctx["flush"]();
  }
  function _emscripten_glFramebufferRenderbuffer(
    target,
    attachment,
    renderbuffertarget,
    renderbuffer
  ) {
    GLctx.framebufferRenderbuffer(
      target,
      attachment,
      renderbuffertarget,
      GL.renderbuffers[renderbuffer]
    );
  }
  function _emscripten_glFramebufferTexture2D(
    target,
    attachment,
    textarget,
    texture,
    level
  ) {
    GLctx.framebufferTexture2D(
      target,
      attachment,
      textarget,
      GL.textures[texture],
      level
    );
  }
  function _emscripten_glFrontFace(x0) {
    GLctx["frontFace"](x0);
  }
  function __glGenObject(n, buffers, createFunction, objectTable) {
    for (var i = 0; i < n; i++) {
      var buffer = GLctx[createFunction]();
      var id = buffer && GL.getNewId(objectTable);
      if (buffer) {
        buffer.name = id;
        objectTable[id] = buffer;
      } else {
        GL.recordError(1282);
      }
      HEAP32[(buffers + i * 4) >> 2] = id;
    }
  }
  function _emscripten_glGenBuffers(n, buffers) {
    __glGenObject(n, buffers, "createBuffer", GL.buffers);
  }
  function _emscripten_glGenFramebuffers(n, ids) {
    __glGenObject(n, ids, "createFramebuffer", GL.framebuffers);
  }
  function _emscripten_glGenQueriesEXT(n, ids) {
    for (var i = 0; i < n; i++) {
      var query = GLctx.disjointTimerQueryExt["createQueryEXT"]();
      if (!query) {
        GL.recordError(1282);
        while (i < n) HEAP32[(ids + i++ * 4) >> 2] = 0;
        return;
      }
      var id = GL.getNewId(GL.queries);
      query.name = id;
      GL.queries[id] = query;
      HEAP32[(ids + i * 4) >> 2] = id;
    }
  }
  function _emscripten_glGenRenderbuffers(n, renderbuffers) {
    __glGenObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers);
  }
  function _emscripten_glGenTextures(n, textures) {
    __glGenObject(n, textures, "createTexture", GL.textures);
  }
  function _emscripten_glGenVertexArraysOES(n, arrays) {
    __glGenObject(n, arrays, "createVertexArray", GL.vaos);
  }
  function _emscripten_glGenerateMipmap(x0) {
    GLctx["generateMipmap"](x0);
  }
  function __glGetActiveAttribOrUniform(
    funcName,
    program,
    index,
    bufSize,
    length,
    size,
    type,
    name
  ) {
    program = GL.programs[program];
    var info = GLctx[funcName](program, index);
    if (info) {
      var numBytesWrittenExclNull =
        name && stringToUTF8(info.name, name, bufSize);
      if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
      if (size) HEAP32[size >> 2] = info.size;
      if (type) HEAP32[type >> 2] = info.type;
    }
  }
  function _emscripten_glGetActiveAttrib(
    program,
    index,
    bufSize,
    length,
    size,
    type,
    name
  ) {
    __glGetActiveAttribOrUniform(
      "getActiveAttrib",
      program,
      index,
      bufSize,
      length,
      size,
      type,
      name
    );
  }
  function _emscripten_glGetActiveUniform(
    program,
    index,
    bufSize,
    length,
    size,
    type,
    name
  ) {
    __glGetActiveAttribOrUniform(
      "getActiveUniform",
      program,
      index,
      bufSize,
      length,
      size,
      type,
      name
    );
  }
  function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
    var result = GLctx.getAttachedShaders(GL.programs[program]);
    var len = result.length;
    if (len > maxCount) {
      len = maxCount;
    }
    HEAP32[count >> 2] = len;
    for (var i = 0; i < len; ++i) {
      var id = GL.shaders.indexOf(result[i]);
      HEAP32[(shaders + i * 4) >> 2] = id;
    }
  }
  function _emscripten_glGetAttribLocation(program, name) {
    return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
  }
  function writeI53ToI64(ptr, num) {
    HEAPU32[ptr >> 2] = num;
    HEAPU32[(ptr + 4) >> 2] = (num - HEAPU32[ptr >> 2]) / 4294967296;
  }
  function emscriptenWebGLGet(name_, p, type) {
    if (!p) {
      GL.recordError(1281);
      return;
    }
    var ret = undefined;
    switch (name_) {
      case 36346:
        ret = 1;
        break;
      case 36344:
        if (type != 0 && type != 1) {
          GL.recordError(1280);
        }
        return;
      case 36345:
        ret = 0;
        break;
      case 34466:
        var formats = GLctx.getParameter(34467);
        ret = formats ? formats.length : 0;
        break;
    }
    if (ret === undefined) {
      var result = GLctx.getParameter(name_);
      switch (typeof result) {
        case "number":
          ret = result;
          break;
        case "boolean":
          ret = result ? 1 : 0;
          break;
        case "string":
          GL.recordError(1280);
          return;
        case "object":
          if (result === null) {
            switch (name_) {
              case 34964:
              case 35725:
              case 34965:
              case 36006:
              case 36007:
              case 32873:
              case 34229:
              case 34068: {
                ret = 0;
                break;
              }
              default: {
                GL.recordError(1280);
                return;
              }
            }
          } else if (
            result instanceof Float32Array ||
            result instanceof Uint32Array ||
            result instanceof Int32Array ||
            result instanceof Array
          ) {
            for (var i = 0; i < result.length; ++i) {
              switch (type) {
                case 0:
                  HEAP32[(p + i * 4) >> 2] = result[i];
                  break;
                case 2:
                  HEAPF32[(p + i * 4) >> 2] = result[i];
                  break;
                case 4:
                  HEAP8[(p + i) >> 0] = result[i] ? 1 : 0;
                  break;
              }
            }
            return;
          } else {
            try {
              ret = result.name | 0;
            } catch (e) {
              GL.recordError(1280);
              err(
                "GL_INVALID_ENUM in glGet" +
                  type +
                  "v: Unknown object returned from WebGL getParameter(" +
                  name_ +
                  ")! (error: " +
                  e +
                  ")"
              );
              return;
            }
          }
          break;
        default:
          GL.recordError(1280);
          err(
            "GL_INVALID_ENUM in glGet" +
              type +
              "v: Native code calling glGet" +
              type +
              "v(" +
              name_ +
              ") and it returns " +
              result +
              " of type " +
              typeof result +
              "!"
          );
          return;
      }
    }
    switch (type) {
      case 1:
        writeI53ToI64(p, ret);
        break;
      case 0:
        HEAP32[p >> 2] = ret;
        break;
      case 2:
        HEAPF32[p >> 2] = ret;
        break;
      case 4:
        HEAP8[p >> 0] = ret ? 1 : 0;
        break;
    }
  }
  function _emscripten_glGetBooleanv(name_, p) {
    emscriptenWebGLGet(name_, p, 4);
  }
  function _emscripten_glGetBufferParameteriv(target, value, data) {
    if (!data) {
      GL.recordError(1281);
      return;
    }
    HEAP32[data >> 2] = GLctx.getBufferParameter(target, value);
  }
  function _emscripten_glGetError() {
    var error = GLctx.getError() || GL.lastError;
    GL.lastError = 0;
    return error;
  }
  function _emscripten_glGetFloatv(name_, p) {
    emscriptenWebGLGet(name_, p, 2);
  }
  function _emscripten_glGetFramebufferAttachmentParameteriv(
    target,
    attachment,
    pname,
    params
  ) {
    var result = GLctx.getFramebufferAttachmentParameter(
      target,
      attachment,
      pname
    );
    if (result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
      result = result.name | 0;
    }
    HEAP32[params >> 2] = result;
  }
  function _emscripten_glGetIntegerv(name_, p) {
    emscriptenWebGLGet(name_, p, 0);
  }
  function _emscripten_glGetProgramInfoLog(
    program,
    maxLength,
    length,
    infoLog
  ) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull =
      maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
  }
  function _emscripten_glGetProgramiv(program, pname, p) {
    if (!p) {
      GL.recordError(1281);
      return;
    }
    if (program >= GL.counter) {
      GL.recordError(1281);
      return;
    }
    program = GL.programs[program];
    if (pname == 35716) {
      var log = GLctx.getProgramInfoLog(program);
      if (log === null) log = "(unknown error)";
      HEAP32[p >> 2] = log.length + 1;
    } else if (pname == 35719) {
      if (!program.maxUniformLength) {
        for (var i = 0; i < GLctx.getProgramParameter(program, 35718); ++i) {
          program.maxUniformLength = Math.max(
            program.maxUniformLength,
            GLctx.getActiveUniform(program, i).name.length + 1
          );
        }
      }
      HEAP32[p >> 2] = program.maxUniformLength;
    } else if (pname == 35722) {
      if (!program.maxAttributeLength) {
        for (var i = 0; i < GLctx.getProgramParameter(program, 35721); ++i) {
          program.maxAttributeLength = Math.max(
            program.maxAttributeLength,
            GLctx.getActiveAttrib(program, i).name.length + 1
          );
        }
      }
      HEAP32[p >> 2] = program.maxAttributeLength;
    } else if (pname == 35381) {
      if (!program.maxUniformBlockNameLength) {
        for (var i = 0; i < GLctx.getProgramParameter(program, 35382); ++i) {
          program.maxUniformBlockNameLength = Math.max(
            program.maxUniformBlockNameLength,
            GLctx.getActiveUniformBlockName(program, i).length + 1
          );
        }
      }
      HEAP32[p >> 2] = program.maxUniformBlockNameLength;
    } else {
      HEAP32[p >> 2] = GLctx.getProgramParameter(program, pname);
    }
  }
  function _emscripten_glGetQueryObjecti64vEXT(id, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    var query = GL.queries[id];
    var param;
    {
      param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    }
    var ret;
    if (typeof param == "boolean") {
      ret = param ? 1 : 0;
    } else {
      ret = param;
    }
    writeI53ToI64(params, ret);
  }
  function _emscripten_glGetQueryObjectivEXT(id, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    var query = GL.queries[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
      ret = param ? 1 : 0;
    } else {
      ret = param;
    }
    HEAP32[params >> 2] = ret;
  }
  function _emscripten_glGetQueryObjectui64vEXT(id, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    var query = GL.queries[id];
    var param;
    {
      param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    }
    var ret;
    if (typeof param == "boolean") {
      ret = param ? 1 : 0;
    } else {
      ret = param;
    }
    writeI53ToI64(params, ret);
  }
  function _emscripten_glGetQueryObjectuivEXT(id, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    var query = GL.queries[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
      ret = param ? 1 : 0;
    } else {
      ret = param;
    }
    HEAP32[params >> 2] = ret;
  }
  function _emscripten_glGetQueryivEXT(target, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    HEAP32[params >> 2] = GLctx.disjointTimerQueryExt["getQueryEXT"](
      target,
      pname
    );
  }
  function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname);
  }
  function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull =
      maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
  }
  function _emscripten_glGetShaderPrecisionFormat(
    shaderType,
    precisionType,
    range,
    precision
  ) {
    var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
    HEAP32[range >> 2] = result.rangeMin;
    HEAP32[(range + 4) >> 2] = result.rangeMax;
    HEAP32[precision >> 2] = result.precision;
  }
  function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
    var result = GLctx.getShaderSource(GL.shaders[shader]);
    if (!result) return;
    var numBytesWrittenExclNull =
      bufSize > 0 && source ? stringToUTF8(result, source, bufSize) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
  }
  function _emscripten_glGetShaderiv(shader, pname, p) {
    if (!p) {
      GL.recordError(1281);
      return;
    }
    if (pname == 35716) {
      var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
      if (log === null) log = "(unknown error)";
      var logLength = log ? log.length + 1 : 0;
      HEAP32[p >> 2] = logLength;
    } else if (pname == 35720) {
      var source = GLctx.getShaderSource(GL.shaders[shader]);
      var sourceLength = source ? source.length + 1 : 0;
      HEAP32[p >> 2] = sourceLength;
    } else {
      HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
    }
  }
  function stringToNewUTF8(jsString) {
    var length = lengthBytesUTF8(jsString) + 1;
    var cString = _malloc(length);
    stringToUTF8(jsString, cString, length);
    return cString;
  }
  function _emscripten_glGetString(name_) {
    var ret = GL.stringCache[name_];
    if (!ret) {
      switch (name_) {
        case 7939:
          var exts = GLctx.getSupportedExtensions() || [];
          exts = exts.concat(
            exts.map(function (e) {
              return "GL_" + e;
            })
          );
          ret = stringToNewUTF8(exts.join(" "));
          break;
        case 7936:
        case 7937:
        case 37445:
        case 37446:
          var s = GLctx.getParameter(name_);
          if (!s) {
            GL.recordError(1280);
          }
          ret = s && stringToNewUTF8(s);
          break;
        case 7938:
          var glVersion = GLctx.getParameter(7938);
          {
            glVersion = "OpenGL ES 2.0 (" + glVersion + ")";
          }
          ret = stringToNewUTF8(glVersion);
          break;
        case 35724:
          var glslVersion = GLctx.getParameter(35724);
          var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
          var ver_num = glslVersion.match(ver_re);
          if (ver_num !== null) {
            if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
            glslVersion =
              "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")";
          }
          ret = stringToNewUTF8(glslVersion);
          break;
        default:
          GL.recordError(1280);
      }
      GL.stringCache[name_] = ret;
    }
    return ret;
  }
  function _emscripten_glGetTexParameterfv(target, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname);
  }
  function _emscripten_glGetTexParameteriv(target, pname, params) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    HEAP32[params >> 2] = GLctx.getTexParameter(target, pname);
  }
  function jstoi_q(str) {
    return parseInt(str);
  }
  function webglGetLeftBracePos(name) {
    return name.slice(-1) == "]" && name.lastIndexOf("[");
  }
  function webglPrepareUniformLocationsBeforeFirstUse(program) {
    var uniformLocsById = program.uniformLocsById,
      uniformSizeAndIdsByName = program.uniformSizeAndIdsByName,
      i,
      j;
    if (!uniformLocsById) {
      program.uniformLocsById = uniformLocsById = {};
      program.uniformArrayNamesById = {};
      for (i = 0; i < GLctx.getProgramParameter(program, 35718); ++i) {
        var u = GLctx.getActiveUniform(program, i);
        var nm = u.name;
        var sz = u.size;
        var lb = webglGetLeftBracePos(nm);
        var arrayName = lb > 0 ? nm.slice(0, lb) : nm;
        var id = program.uniformIdCounter;
        program.uniformIdCounter += sz;
        uniformSizeAndIdsByName[arrayName] = [sz, id];
        for (j = 0; j < sz; ++j) {
          uniformLocsById[id] = j;
          program.uniformArrayNamesById[id++] = arrayName;
        }
      }
    }
  }
  function _emscripten_glGetUniformLocation(program, name) {
    name = UTF8ToString(name);
    if ((program = GL.programs[program])) {
      webglPrepareUniformLocationsBeforeFirstUse(program);
      var uniformLocsById = program.uniformLocsById;
      var arrayIndex = 0;
      var uniformBaseName = name;
      var leftBrace = webglGetLeftBracePos(name);
      if (leftBrace > 0) {
        arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0;
        uniformBaseName = name.slice(0, leftBrace);
      }
      var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
      if (sizeAndId && arrayIndex < sizeAndId[0]) {
        arrayIndex += sizeAndId[1];
        if (
          (uniformLocsById[arrayIndex] =
            uniformLocsById[arrayIndex] ||
            GLctx.getUniformLocation(program, name))
        ) {
          return arrayIndex;
        }
      }
    } else {
      GL.recordError(1281);
    }
    return -1;
  }
  function webglGetUniformLocation(location) {
    var p = GLctx.currentProgram;
    if (p) {
      var webglLoc = p.uniformLocsById[location];
      if (typeof webglLoc === "number") {
        p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(
          p,
          p.uniformArrayNamesById[location] +
            (webglLoc > 0 ? "[" + webglLoc + "]" : "")
        );
      }
      return webglLoc;
    } else {
      GL.recordError(1282);
    }
  }
  function emscriptenWebGLGetUniform(program, location, params, type) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    program = GL.programs[program];
    webglPrepareUniformLocationsBeforeFirstUse(program);
    var data = GLctx.getUniform(program, webglGetUniformLocation(location));
    if (typeof data == "number" || typeof data == "boolean") {
      switch (type) {
        case 0:
          HEAP32[params >> 2] = data;
          break;
        case 2:
          HEAPF32[params >> 2] = data;
          break;
      }
    } else {
      for (var i = 0; i < data.length; i++) {
        switch (type) {
          case 0:
            HEAP32[(params + i * 4) >> 2] = data[i];
            break;
          case 2:
            HEAPF32[(params + i * 4) >> 2] = data[i];
            break;
        }
      }
    }
  }
  function _emscripten_glGetUniformfv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, 2);
  }
  function _emscripten_glGetUniformiv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, 0);
  }
  function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
    if (!pointer) {
      GL.recordError(1281);
      return;
    }
    HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname);
  }
  function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
    if (!params) {
      GL.recordError(1281);
      return;
    }
    var data = GLctx.getVertexAttrib(index, pname);
    if (pname == 34975) {
      HEAP32[params >> 2] = data && data["name"];
    } else if (typeof data == "number" || typeof data == "boolean") {
      switch (type) {
        case 0:
          HEAP32[params >> 2] = data;
          break;
        case 2:
          HEAPF32[params >> 2] = data;
          break;
        case 5:
          HEAP32[params >> 2] = Math.fround(data);
          break;
      }
    } else {
      for (var i = 0; i < data.length; i++) {
        switch (type) {
          case 0:
            HEAP32[(params + i * 4) >> 2] = data[i];
            break;
          case 2:
            HEAPF32[(params + i * 4) >> 2] = data[i];
            break;
          case 5:
            HEAP32[(params + i * 4) >> 2] = Math.fround(data[i]);
            break;
        }
      }
    }
  }
  function _emscripten_glGetVertexAttribfv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
  }
  function _emscripten_glGetVertexAttribiv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
  }
  function _emscripten_glHint(x0, x1) {
    GLctx["hint"](x0, x1);
  }
  function _emscripten_glIsBuffer(buffer) {
    var b = GL.buffers[buffer];
    if (!b) return 0;
    return GLctx.isBuffer(b);
  }
  function _emscripten_glIsEnabled(x0) {
    return GLctx["isEnabled"](x0);
  }
  function _emscripten_glIsFramebuffer(framebuffer) {
    var fb = GL.framebuffers[framebuffer];
    if (!fb) return 0;
    return GLctx.isFramebuffer(fb);
  }
  function _emscripten_glIsProgram(program) {
    program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program);
  }
  function _emscripten_glIsQueryEXT(id) {
    var query = GL.queries[id];
    if (!query) return 0;
    return GLctx.disjointTimerQueryExt["isQueryEXT"](query);
  }
  function _emscripten_glIsRenderbuffer(renderbuffer) {
    var rb = GL.renderbuffers[renderbuffer];
    if (!rb) return 0;
    return GLctx.isRenderbuffer(rb);
  }
  function _emscripten_glIsShader(shader) {
    var s = GL.shaders[shader];
    if (!s) return 0;
    return GLctx.isShader(s);
  }
  function _emscripten_glIsTexture(id) {
    var texture = GL.textures[id];
    if (!texture) return 0;
    return GLctx.isTexture(texture);
  }
  function _emscripten_glIsVertexArrayOES(array) {
    var vao = GL.vaos[array];
    if (!vao) return 0;
    return GLctx["isVertexArray"](vao);
  }
  function _emscripten_glLineWidth(x0) {
    GLctx["lineWidth"](x0);
  }
  function _emscripten_glLinkProgram(program) {
    program = GL.programs[program];
    GLctx.linkProgram(program);
    program.uniformLocsById = 0;
    program.uniformSizeAndIdsByName = {};
  }
  function _emscripten_glPixelStorei(pname, param) {
    if (pname == 3317) {
      GL.unpackAlignment = param;
    }
    GLctx.pixelStorei(pname, param);
  }
  function _emscripten_glPolygonOffset(x0, x1) {
    GLctx["polygonOffset"](x0, x1);
  }
  function _emscripten_glQueryCounterEXT(id, target) {
    GLctx.disjointTimerQueryExt["queryCounterEXT"](GL.queries[id], target);
  }
  function computeUnpackAlignedImageSize(
    width,
    height,
    sizePerPixel,
    alignment
  ) {
    function roundedToNextMultipleOf(x, y) {
      return (x + y - 1) & -y;
    }
    var plainRowSize = width * sizePerPixel;
    var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
    return height * alignedRowSize;
  }
  function __colorChannelsInGlTextureFormat(format) {
    var colorChannels = {
      5: 3,
      6: 4,
      8: 2,
      29502: 3,
      29504: 4,
    };
    return colorChannels[format - 6402] || 1;
  }
  function heapObjectForWebGLType(type) {
    type -= 5120;
    if (type == 1) return HEAPU8;
    if (type == 4) return HEAP32;
    if (type == 6) return HEAPF32;
    if (type == 5 || type == 28922) return HEAPU32;
    return HEAPU16;
  }
  function heapAccessShiftForWebGLHeap(heap) {
    return 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
  }
  function emscriptenWebGLGetTexPixelData(
    type,
    format,
    width,
    height,
    pixels,
    internalFormat
  ) {
    var heap = heapObjectForWebGLType(type);
    var shift = heapAccessShiftForWebGLHeap(heap);
    var byteSize = 1 << shift;
    var sizePerPixel = __colorChannelsInGlTextureFormat(format) * byteSize;
    var bytes = computeUnpackAlignedImageSize(
      width,
      height,
      sizePerPixel,
      GL.unpackAlignment
    );
    return heap.subarray(pixels >> shift, (pixels + bytes) >> shift);
  }
  function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
    var pixelData = emscriptenWebGLGetTexPixelData(
      type,
      format,
      width,
      height,
      pixels,
      format
    );
    if (!pixelData) {
      GL.recordError(1280);
      return;
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData);
  }
  function _emscripten_glReleaseShaderCompiler() {}
  function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx["renderbufferStorage"](x0, x1, x2, x3);
  }
  function _emscripten_glSampleCoverage(value, invert) {
    GLctx.sampleCoverage(value, !!invert);
  }
  function _emscripten_glScissor(x0, x1, x2, x3) {
    GLctx["scissor"](x0, x1, x2, x3);
  }
  function _emscripten_glShaderBinary() {
    GL.recordError(1280);
  }
  function _emscripten_glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source);
  }
  function _emscripten_glStencilFunc(x0, x1, x2) {
    GLctx["stencilFunc"](x0, x1, x2);
  }
  function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) {
    GLctx["stencilFuncSeparate"](x0, x1, x2, x3);
  }
  function _emscripten_glStencilMask(x0) {
    GLctx["stencilMask"](x0);
  }
  function _emscripten_glStencilMaskSeparate(x0, x1) {
    GLctx["stencilMaskSeparate"](x0, x1);
  }
  function _emscripten_glStencilOp(x0, x1, x2) {
    GLctx["stencilOp"](x0, x1, x2);
  }
  function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) {
    GLctx["stencilOpSeparate"](x0, x1, x2, x3);
  }
  function _emscripten_glTexImage2D(
    target,
    level,
    internalFormat,
    width,
    height,
    border,
    format,
    type,
    pixels
  ) {
    GLctx.texImage2D(
      target,
      level,
      internalFormat,
      width,
      height,
      border,
      format,
      type,
      pixels
        ? emscriptenWebGLGetTexPixelData(
            type,
            format,
            width,
            height,
            pixels,
            internalFormat
          )
        : null
    );
  }
  function _emscripten_glTexParameterf(x0, x1, x2) {
    GLctx["texParameterf"](x0, x1, x2);
  }
  function _emscripten_glTexParameterfv(target, pname, params) {
    var param = HEAPF32[params >> 2];
    GLctx.texParameterf(target, pname, param);
  }
  function _emscripten_glTexParameteri(x0, x1, x2) {
    GLctx["texParameteri"](x0, x1, x2);
  }
  function _emscripten_glTexParameteriv(target, pname, params) {
    var param = HEAP32[params >> 2];
    GLctx.texParameteri(target, pname, param);
  }
  function _emscripten_glTexSubImage2D(
    target,
    level,
    xoffset,
    yoffset,
    width,
    height,
    format,
    type,
    pixels
  ) {
    var pixelData = null;
    if (pixels)
      pixelData = emscriptenWebGLGetTexPixelData(
        type,
        format,
        width,
        height,
        pixels,
        0
      );
    GLctx.texSubImage2D(
      target,
      level,
      xoffset,
      yoffset,
      width,
      height,
      format,
      type,
      pixelData
    );
  }
  function _emscripten_glUniform1f(location, v0) {
    GLctx.uniform1f(webglGetUniformLocation(location), v0);
  }
  var miniTempWebGLFloatBuffers = [];
  function _emscripten_glUniform1fv(location, count, value) {
    if (count <= 288) {
      var view = miniTempWebGLFloatBuffers[count - 1];
      for (var i = 0; i < count; ++i) {
        view[i] = HEAPF32[(value + 4 * i) >> 2];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 4) >> 2);
    }
    GLctx.uniform1fv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform1i(location, v0) {
    GLctx.uniform1i(webglGetUniformLocation(location), v0);
  }
  var __miniTempWebGLIntBuffers = [];
  function _emscripten_glUniform1iv(location, count, value) {
    if (count <= 288) {
      var view = __miniTempWebGLIntBuffers[count - 1];
      for (var i = 0; i < count; ++i) {
        view[i] = HEAP32[(value + 4 * i) >> 2];
      }
    } else {
      var view = HEAP32.subarray(value >> 2, (value + count * 4) >> 2);
    }
    GLctx.uniform1iv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform2f(location, v0, v1) {
    GLctx.uniform2f(webglGetUniformLocation(location), v0, v1);
  }
  function _emscripten_glUniform2fv(location, count, value) {
    if (count <= 144) {
      var view = miniTempWebGLFloatBuffers[2 * count - 1];
      for (var i = 0; i < 2 * count; i += 2) {
        view[i] = HEAPF32[(value + 4 * i) >> 2];
        view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 8) >> 2);
    }
    GLctx.uniform2fv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform2i(location, v0, v1) {
    GLctx.uniform2i(webglGetUniformLocation(location), v0, v1);
  }
  function _emscripten_glUniform2iv(location, count, value) {
    if (count <= 144) {
      var view = __miniTempWebGLIntBuffers[2 * count - 1];
      for (var i = 0; i < 2 * count; i += 2) {
        view[i] = HEAP32[(value + 4 * i) >> 2];
        view[i + 1] = HEAP32[(value + (4 * i + 4)) >> 2];
      }
    } else {
      var view = HEAP32.subarray(value >> 2, (value + count * 8) >> 2);
    }
    GLctx.uniform2iv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform3f(location, v0, v1, v2) {
    GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2);
  }
  function _emscripten_glUniform3fv(location, count, value) {
    if (count <= 96) {
      var view = miniTempWebGLFloatBuffers[3 * count - 1];
      for (var i = 0; i < 3 * count; i += 3) {
        view[i] = HEAPF32[(value + 4 * i) >> 2];
        view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
        view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 12) >> 2);
    }
    GLctx.uniform3fv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform3i(location, v0, v1, v2) {
    GLctx.uniform3i(webglGetUniformLocation(location), v0, v1, v2);
  }
  function _emscripten_glUniform3iv(location, count, value) {
    if (count <= 96) {
      var view = __miniTempWebGLIntBuffers[3 * count - 1];
      for (var i = 0; i < 3 * count; i += 3) {
        view[i] = HEAP32[(value + 4 * i) >> 2];
        view[i + 1] = HEAP32[(value + (4 * i + 4)) >> 2];
        view[i + 2] = HEAP32[(value + (4 * i + 8)) >> 2];
      }
    } else {
      var view = HEAP32.subarray(value >> 2, (value + count * 12) >> 2);
    }
    GLctx.uniform3iv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
    GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3);
  }
  function _emscripten_glUniform4fv(location, count, value) {
    if (count <= 72) {
      var view = miniTempWebGLFloatBuffers[4 * count - 1];
      var heap = HEAPF32;
      value >>= 2;
      for (var i = 0; i < 4 * count; i += 4) {
        var dst = value + i;
        view[i] = heap[dst];
        view[i + 1] = heap[dst + 1];
        view[i + 2] = heap[dst + 2];
        view[i + 3] = heap[dst + 3];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniform4fv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
    GLctx.uniform4i(webglGetUniformLocation(location), v0, v1, v2, v3);
  }
  function _emscripten_glUniform4iv(location, count, value) {
    if (count <= 72) {
      var view = __miniTempWebGLIntBuffers[4 * count - 1];
      for (var i = 0; i < 4 * count; i += 4) {
        view[i] = HEAP32[(value + 4 * i) >> 2];
        view[i + 1] = HEAP32[(value + (4 * i + 4)) >> 2];
        view[i + 2] = HEAP32[(value + (4 * i + 8)) >> 2];
        view[i + 3] = HEAP32[(value + (4 * i + 12)) >> 2];
      }
    } else {
      var view = HEAP32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniform4iv(webglGetUniformLocation(location), view);
  }
  function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
    if (count <= 72) {
      var view = miniTempWebGLFloatBuffers[4 * count - 1];
      for (var i = 0; i < 4 * count; i += 4) {
        view[i] = HEAPF32[(value + 4 * i) >> 2];
        view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
        view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
        view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniformMatrix2fv(
      webglGetUniformLocation(location),
      !!transpose,
      view
    );
  }
  function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
    if (count <= 32) {
      var view = miniTempWebGLFloatBuffers[9 * count - 1];
      for (var i = 0; i < 9 * count; i += 9) {
        view[i] = HEAPF32[(value + 4 * i) >> 2];
        view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
        view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
        view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
        view[i + 4] = HEAPF32[(value + (4 * i + 16)) >> 2];
        view[i + 5] = HEAPF32[(value + (4 * i + 20)) >> 2];
        view[i + 6] = HEAPF32[(value + (4 * i + 24)) >> 2];
        view[i + 7] = HEAPF32[(value + (4 * i + 28)) >> 2];
        view[i + 8] = HEAPF32[(value + (4 * i + 32)) >> 2];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 36) >> 2);
    }
    GLctx.uniformMatrix3fv(
      webglGetUniformLocation(location),
      !!transpose,
      view
    );
  }
  function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
    if (count <= 18) {
      var view = miniTempWebGLFloatBuffers[16 * count - 1];
      var heap = HEAPF32;
      value >>= 2;
      for (var i = 0; i < 16 * count; i += 16) {
        var dst = value + i;
        view[i] = heap[dst];
        view[i + 1] = heap[dst + 1];
        view[i + 2] = heap[dst + 2];
        view[i + 3] = heap[dst + 3];
        view[i + 4] = heap[dst + 4];
        view[i + 5] = heap[dst + 5];
        view[i + 6] = heap[dst + 6];
        view[i + 7] = heap[dst + 7];
        view[i + 8] = heap[dst + 8];
        view[i + 9] = heap[dst + 9];
        view[i + 10] = heap[dst + 10];
        view[i + 11] = heap[dst + 11];
        view[i + 12] = heap[dst + 12];
        view[i + 13] = heap[dst + 13];
        view[i + 14] = heap[dst + 14];
        view[i + 15] = heap[dst + 15];
      }
    } else {
      var view = HEAPF32.subarray(value >> 2, (value + count * 64) >> 2);
    }
    GLctx.uniformMatrix4fv(
      webglGetUniformLocation(location),
      !!transpose,
      view
    );
  }
  function _emscripten_glUseProgram(program) {
    program = GL.programs[program];
    GLctx.useProgram(program);
    GLctx.currentProgram = program;
  }
  function _emscripten_glValidateProgram(program) {
    GLctx.validateProgram(GL.programs[program]);
  }
  function _emscripten_glVertexAttrib1f(x0, x1) {
    GLctx["vertexAttrib1f"](x0, x1);
  }
  function _emscripten_glVertexAttrib1fv(index, v) {
    GLctx.vertexAttrib1f(index, HEAPF32[v >> 2]);
  }
  function _emscripten_glVertexAttrib2f(x0, x1, x2) {
    GLctx["vertexAttrib2f"](x0, x1, x2);
  }
  function _emscripten_glVertexAttrib2fv(index, v) {
    GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[(v + 4) >> 2]);
  }
  function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) {
    GLctx["vertexAttrib3f"](x0, x1, x2, x3);
  }
  function _emscripten_glVertexAttrib3fv(index, v) {
    GLctx.vertexAttrib3f(
      index,
      HEAPF32[v >> 2],
      HEAPF32[(v + 4) >> 2],
      HEAPF32[(v + 8) >> 2]
    );
  }
  function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) {
    GLctx["vertexAttrib4f"](x0, x1, x2, x3, x4);
  }
  function _emscripten_glVertexAttrib4fv(index, v) {
    GLctx.vertexAttrib4f(
      index,
      HEAPF32[v >> 2],
      HEAPF32[(v + 4) >> 2],
      HEAPF32[(v + 8) >> 2],
      HEAPF32[(v + 12) >> 2]
    );
  }
  function _emscripten_glVertexAttribDivisorANGLE(index, divisor) {
    GLctx["vertexAttribDivisor"](index, divisor);
  }
  function _emscripten_glVertexAttribPointer(
    index,
    size,
    type,
    normalized,
    stride,
    ptr
  ) {
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
  }
  function _emscripten_glViewport(x0, x1, x2, x3) {
    GLctx["viewport"](x0, x1, x2, x3);
  }
  function _emscripten_has_asyncify() {
    return 0;
  }
  function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.copyWithin(dest, src, src + num);
  }
  function doRequestFullscreen(target, strategy) {
    if (!JSEvents.fullscreenEnabled()) return -1;
    target = findEventTarget(target);
    if (!target) return -4;
    if (!target.requestFullscreen && !target.webkitRequestFullscreen) {
      return -3;
    }
    var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
    if (!canPerformRequests) {
      if (strategy.deferUntilInEventHandler) {
        JSEvents.deferCall(_JSEvents_requestFullscreen, 1, [target, strategy]);
        return 1;
      } else {
        return -2;
      }
    }
    return _JSEvents_requestFullscreen(target, strategy);
  }
  function _emscripten_request_fullscreen_strategy(
    target,
    deferUntilInEventHandler,
    fullscreenStrategy
  ) {
    var strategy = {
      scaleMode: HEAP32[fullscreenStrategy >> 2],
      canvasResolutionScaleMode: HEAP32[(fullscreenStrategy + 4) >> 2],
      filteringMode: HEAP32[(fullscreenStrategy + 8) >> 2],
      deferUntilInEventHandler: deferUntilInEventHandler,
      canvasResizedCallback: HEAP32[(fullscreenStrategy + 12) >> 2],
      canvasResizedCallbackUserData: HEAP32[(fullscreenStrategy + 16) >> 2],
    };
    return doRequestFullscreen(target, strategy);
  }
  function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
    target = findEventTarget(target);
    if (!target) return -4;
    if (!target.requestPointerLock && !target.msRequestPointerLock) {
      return -1;
    }
    var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
    if (!canPerformRequests) {
      if (deferUntilInEventHandler) {
        JSEvents.deferCall(requestPointerLock, 2, [target]);
        return 1;
      } else {
        return -2;
      }
    }
    return requestPointerLock(target);
  }
  function emscripten_realloc_buffer(size) {
    try {
      wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16);
      updateGlobalBufferAndViews(wasmMemory.buffer);
      return 1;
    } catch (e) {}
  }
  function _emscripten_resize_heap(requestedSize) {
    var oldSize = HEAPU8.length;
    requestedSize = requestedSize >>> 0;
    var maxHeapSize = 2147483648;
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(
        overGrownHeapSize,
        requestedSize + 100663296
      );
      var newSize = Math.min(
        maxHeapSize,
        alignUp(Math.max(requestedSize, overGrownHeapSize), 65536)
      );
      var replacement = emscripten_realloc_buffer(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  }
  function _emscripten_sample_gamepad_data() {
    return (JSEvents.lastGamepadState = navigator.getGamepads
      ? navigator.getGamepads()
      : navigator.webkitGetGamepads
      ? navigator.webkitGetGamepads()
      : null)
      ? 0
      : -1;
  }
  function registerBeforeUnloadEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString
  ) {
    var beforeUnloadEventHandlerFunc = function (ev) {
      var e = ev || event;
      var confirmationMessage = wasmTable.get(callbackfunc)(
        eventTypeId,
        0,
        userData
      );
      if (confirmationMessage) {
        confirmationMessage = UTF8ToString(confirmationMessage);
      }
      if (confirmationMessage) {
        e.preventDefault();
        e.returnValue = confirmationMessage;
        return confirmationMessage;
      }
    };
    var eventHandler = {
      target: findEventTarget(target),
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: beforeUnloadEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_beforeunload_callback_on_thread(
    userData,
    callbackfunc,
    targetThread
  ) {
    if (typeof onbeforeunload === "undefined") return -1;
    if (targetThread !== 1) return -5;
    registerBeforeUnloadEventCallback(
      2,
      userData,
      true,
      callbackfunc,
      28,
      "beforeunload"
    );
    return 0;
  }
  function registerFocusEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.focusEvent) JSEvents.focusEvent = _malloc(256);
    var focusEventHandlerFunc = function (ev) {
      var e = ev || event;
      var nodeName = JSEvents.getNodeNameForTarget(e.target);
      var id = e.target.id ? e.target.id : "";
      var focusEvent = JSEvents.focusEvent;
      stringToUTF8(nodeName, focusEvent + 0, 128);
      stringToUTF8(id, focusEvent + 128, 128);
      if (wasmTable.get(callbackfunc)(eventTypeId, focusEvent, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: findEventTarget(target),
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: focusEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_blur_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerFocusEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      12,
      "blur",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_element_css_size(target, width, height) {
    target = findEventTarget(target);
    if (!target) return -4;
    target.style.width = width + "px";
    target.style.height = height + "px";
    return 0;
  }
  function _emscripten_set_focus_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerFocusEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      13,
      "focus",
      targetThread
    );
    return 0;
  }
  function fillFullscreenChangeEventData(eventStruct) {
    var fullscreenElement =
      document.fullscreenElement ||
      document.mozFullScreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement;
    var isFullscreen = !!fullscreenElement;
    HEAP32[eventStruct >> 2] = isFullscreen;
    HEAP32[(eventStruct + 4) >> 2] = JSEvents.fullscreenEnabled();
    var reportedElement = isFullscreen
      ? fullscreenElement
      : JSEvents.previousFullscreenElement;
    var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
    var id = reportedElement && reportedElement.id ? reportedElement.id : "";
    stringToUTF8(nodeName, eventStruct + 8, 128);
    stringToUTF8(id, eventStruct + 136, 128);
    HEAP32[(eventStruct + 264) >> 2] = reportedElement
      ? reportedElement.clientWidth
      : 0;
    HEAP32[(eventStruct + 268) >> 2] = reportedElement
      ? reportedElement.clientHeight
      : 0;
    HEAP32[(eventStruct + 272) >> 2] = screen.width;
    HEAP32[(eventStruct + 276) >> 2] = screen.height;
    if (isFullscreen) {
      JSEvents.previousFullscreenElement = fullscreenElement;
    }
  }
  function registerFullscreenChangeEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.fullscreenChangeEvent)
      JSEvents.fullscreenChangeEvent = _malloc(280);
    var fullscreenChangeEventhandlerFunc = function (ev) {
      var e = ev || event;
      var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;
      fillFullscreenChangeEventData(fullscreenChangeEvent);
      if (
        wasmTable.get(callbackfunc)(
          eventTypeId,
          fullscreenChangeEvent,
          userData
        )
      )
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: fullscreenChangeEventhandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_fullscreenchange_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    if (!JSEvents.fullscreenEnabled()) return -1;
    target = findEventTarget(target);
    if (!target) return -4;
    registerFullscreenChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      19,
      "fullscreenchange",
      targetThread
    );
    registerFullscreenChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      19,
      "webkitfullscreenchange",
      targetThread
    );
    return 0;
  }
  function registerGamepadEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.gamepadEvent) JSEvents.gamepadEvent = _malloc(1432);
    var gamepadEventHandlerFunc = function (ev) {
      var e = ev || event;
      var gamepadEvent = JSEvents.gamepadEvent;
      fillGamepadEventData(gamepadEvent, e["gamepad"]);
      if (wasmTable.get(callbackfunc)(eventTypeId, gamepadEvent, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: findEventTarget(target),
      allowsDeferredCalls: true,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: gamepadEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_gamepadconnected_callback_on_thread(
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    registerGamepadEventCallback(
      2,
      userData,
      useCapture,
      callbackfunc,
      26,
      "gamepadconnected",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_gamepaddisconnected_callback_on_thread(
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    registerGamepadEventCallback(
      2,
      userData,
      useCapture,
      callbackfunc,
      27,
      "gamepaddisconnected",
      targetThread
    );
    return 0;
  }
  function registerKeyEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.keyEvent) JSEvents.keyEvent = _malloc(164);
    var keyEventHandlerFunc = function (e) {
      var keyEventData = JSEvents.keyEvent;
      var idx = keyEventData >> 2;
      HEAP32[idx + 0] = e.location;
      HEAP32[idx + 1] = e.ctrlKey;
      HEAP32[idx + 2] = e.shiftKey;
      HEAP32[idx + 3] = e.altKey;
      HEAP32[idx + 4] = e.metaKey;
      HEAP32[idx + 5] = e.repeat;
      HEAP32[idx + 6] = e.charCode;
      HEAP32[idx + 7] = e.keyCode;
      HEAP32[idx + 8] = e.which;
      stringToUTF8(e.key || "", keyEventData + 36, 32);
      stringToUTF8(e.code || "", keyEventData + 68, 32);
      stringToUTF8(e.char || "", keyEventData + 100, 32);
      stringToUTF8(e.locale || "", keyEventData + 132, 32);
      if (wasmTable.get(callbackfunc)(eventTypeId, keyEventData, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: findEventTarget(target),
      allowsDeferredCalls: true,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: keyEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_keydown_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerKeyEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      2,
      "keydown",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_keypress_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerKeyEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      1,
      "keypress",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_keyup_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerKeyEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      3,
      "keyup",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_main_loop_arg(func, arg, fps, simulateInfiniteLoop) {
    var browserIterationFunc = function () {
      wasmTable.get(func)(arg);
    };
    setMainLoop(browserIterationFunc, fps, simulateInfiniteLoop, arg);
  }
  function fillMouseEventData(eventStruct, e, target) {
    var idx = eventStruct >> 2;
    HEAP32[idx + 0] = e.screenX;
    HEAP32[idx + 1] = e.screenY;
    HEAP32[idx + 2] = e.clientX;
    HEAP32[idx + 3] = e.clientY;
    HEAP32[idx + 4] = e.ctrlKey;
    HEAP32[idx + 5] = e.shiftKey;
    HEAP32[idx + 6] = e.altKey;
    HEAP32[idx + 7] = e.metaKey;
    HEAP16[idx * 2 + 16] = e.button;
    HEAP16[idx * 2 + 17] = e.buttons;
    HEAP32[idx + 9] = e["movementX"];
    HEAP32[idx + 10] = e["movementY"];
    var rect = getBoundingClientRect(target);
    HEAP32[idx + 11] = e.clientX - rect.left;
    HEAP32[idx + 12] = e.clientY - rect.top;
  }
  function registerMouseEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.mouseEvent) JSEvents.mouseEvent = _malloc(64);
    target = findEventTarget(target);
    var mouseEventHandlerFunc = function (ev) {
      var e = ev || event;
      fillMouseEventData(JSEvents.mouseEvent, e, target);
      if (
        wasmTable.get(callbackfunc)(eventTypeId, JSEvents.mouseEvent, userData)
      )
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      allowsDeferredCalls:
        eventTypeString != "mousemove" &&
        eventTypeString != "mouseenter" &&
        eventTypeString != "mouseleave",
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: mouseEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_mousedown_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerMouseEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      5,
      "mousedown",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_mouseenter_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerMouseEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      33,
      "mouseenter",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_mouseleave_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerMouseEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      34,
      "mouseleave",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_mousemove_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerMouseEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      8,
      "mousemove",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_mouseup_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerMouseEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      6,
      "mouseup",
      targetThread
    );
    return 0;
  }
  function fillPointerlockChangeEventData(eventStruct) {
    var pointerLockElement =
      document.pointerLockElement ||
      document.mozPointerLockElement ||
      document.webkitPointerLockElement ||
      document.msPointerLockElement;
    var isPointerlocked = !!pointerLockElement;
    HEAP32[eventStruct >> 2] = isPointerlocked;
    var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
    var id =
      pointerLockElement && pointerLockElement.id ? pointerLockElement.id : "";
    stringToUTF8(nodeName, eventStruct + 4, 128);
    stringToUTF8(id, eventStruct + 132, 128);
  }
  function registerPointerlockChangeEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.pointerlockChangeEvent)
      JSEvents.pointerlockChangeEvent = _malloc(260);
    var pointerlockChangeEventHandlerFunc = function (ev) {
      var e = ev || event;
      var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
      fillPointerlockChangeEventData(pointerlockChangeEvent);
      if (
        wasmTable.get(callbackfunc)(
          eventTypeId,
          pointerlockChangeEvent,
          userData
        )
      )
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: pointerlockChangeEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_pointerlockchange_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    if (
      !document ||
      !document.body ||
      (!document.body.requestPointerLock &&
        !document.body.mozRequestPointerLock &&
        !document.body.webkitRequestPointerLock &&
        !document.body.msRequestPointerLock)
    ) {
      return -1;
    }
    target = findEventTarget(target);
    if (!target) return -4;
    registerPointerlockChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      20,
      "pointerlockchange",
      targetThread
    );
    registerPointerlockChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      20,
      "mozpointerlockchange",
      targetThread
    );
    registerPointerlockChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      20,
      "webkitpointerlockchange",
      targetThread
    );
    registerPointerlockChangeEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      20,
      "mspointerlockchange",
      targetThread
    );
    return 0;
  }
  function registerUiEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.uiEvent) JSEvents.uiEvent = _malloc(36);
    target = findEventTarget(target);
    var uiEventHandlerFunc = function (ev) {
      var e = ev || event;
      if (e.target != target) {
        return;
      }
      var b = document.body;
      if (!b) {
        return;
      }
      var uiEvent = JSEvents.uiEvent;
      HEAP32[uiEvent >> 2] = e.detail;
      HEAP32[(uiEvent + 4) >> 2] = b.clientWidth;
      HEAP32[(uiEvent + 8) >> 2] = b.clientHeight;
      HEAP32[(uiEvent + 12) >> 2] = innerWidth;
      HEAP32[(uiEvent + 16) >> 2] = innerHeight;
      HEAP32[(uiEvent + 20) >> 2] = outerWidth;
      HEAP32[(uiEvent + 24) >> 2] = outerHeight;
      HEAP32[(uiEvent + 28) >> 2] = pageXOffset;
      HEAP32[(uiEvent + 32) >> 2] = pageYOffset;
      if (wasmTable.get(callbackfunc)(eventTypeId, uiEvent, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: uiEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_resize_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerUiEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      10,
      "resize",
      targetThread
    );
    return 0;
  }
  function registerTouchEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc(1684);
    target = findEventTarget(target);
    var touchEventHandlerFunc = function (e) {
      var touches = {};
      var et = e.touches;
      for (var i = 0; i < et.length; ++i) {
        var touch = et[i];
        touches[touch.identifier] = touch;
      }
      et = e.changedTouches;
      for (var i = 0; i < et.length; ++i) {
        var touch = et[i];
        touch.isChanged = 1;
        touches[touch.identifier] = touch;
      }
      et = e.targetTouches;
      for (var i = 0; i < et.length; ++i) {
        touches[et[i].identifier].onTarget = 1;
      }
      var touchEvent = JSEvents.touchEvent;
      var idx = touchEvent >> 2;
      HEAP32[idx + 1] = e.ctrlKey;
      HEAP32[idx + 2] = e.shiftKey;
      HEAP32[idx + 3] = e.altKey;
      HEAP32[idx + 4] = e.metaKey;
      idx += 5;
      var targetRect = getBoundingClientRect(target);
      var numTouches = 0;
      for (var i in touches) {
        var t = touches[i];
        HEAP32[idx + 0] = t.identifier;
        HEAP32[idx + 1] = t.screenX;
        HEAP32[idx + 2] = t.screenY;
        HEAP32[idx + 3] = t.clientX;
        HEAP32[idx + 4] = t.clientY;
        HEAP32[idx + 5] = t.pageX;
        HEAP32[idx + 6] = t.pageY;
        HEAP32[idx + 7] = t.isChanged;
        HEAP32[idx + 8] = t.onTarget;
        HEAP32[idx + 9] = t.clientX - targetRect.left;
        HEAP32[idx + 10] = t.clientY - targetRect.top;
        idx += 13;
        if (++numTouches > 31) {
          break;
        }
      }
      HEAP32[touchEvent >> 2] = numTouches;
      if (wasmTable.get(callbackfunc)(eventTypeId, touchEvent, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      allowsDeferredCalls:
        eventTypeString == "touchstart" || eventTypeString == "touchend",
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: touchEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_touchcancel_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerTouchEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      25,
      "touchcancel",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_touchend_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerTouchEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      23,
      "touchend",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_touchmove_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerTouchEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      24,
      "touchmove",
      targetThread
    );
    return 0;
  }
  function _emscripten_set_touchstart_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    registerTouchEventCallback(
      target,
      userData,
      useCapture,
      callbackfunc,
      22,
      "touchstart",
      targetThread
    );
    return 0;
  }
  function fillVisibilityChangeEventData(eventStruct) {
    var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
    var visibilityState = visibilityStates.indexOf(document.visibilityState);
    HEAP32[eventStruct >> 2] = document.hidden;
    HEAP32[(eventStruct + 4) >> 2] = visibilityState;
  }
  function registerVisibilityChangeEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.visibilityChangeEvent)
      JSEvents.visibilityChangeEvent = _malloc(8);
    var visibilityChangeEventHandlerFunc = function (ev) {
      var e = ev || event;
      var visibilityChangeEvent = JSEvents.visibilityChangeEvent;
      fillVisibilityChangeEventData(visibilityChangeEvent);
      if (
        wasmTable.get(callbackfunc)(
          eventTypeId,
          visibilityChangeEvent,
          userData
        )
      )
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: visibilityChangeEventHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_visibilitychange_callback_on_thread(
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    if (!specialHTMLTargets[1]) {
      return -4;
    }
    registerVisibilityChangeEventCallback(
      specialHTMLTargets[1],
      userData,
      useCapture,
      callbackfunc,
      21,
      "visibilitychange",
      targetThread
    );
    return 0;
  }
  function registerWheelEventCallback(
    target,
    userData,
    useCapture,
    callbackfunc,
    eventTypeId,
    eventTypeString,
    targetThread
  ) {
    if (!JSEvents.wheelEvent) JSEvents.wheelEvent = _malloc(96);
    var wheelHandlerFunc = function (ev) {
      var e = ev || event;
      var wheelEvent = JSEvents.wheelEvent;
      fillMouseEventData(wheelEvent, e, target);
      HEAPF64[(wheelEvent + 64) >> 3] = e["deltaX"];
      HEAPF64[(wheelEvent + 72) >> 3] = e["deltaY"];
      HEAPF64[(wheelEvent + 80) >> 3] = e["deltaZ"];
      HEAP32[(wheelEvent + 88) >> 2] = e["deltaMode"];
      if (wasmTable.get(callbackfunc)(eventTypeId, wheelEvent, userData))
        e.preventDefault();
    };
    var eventHandler = {
      target: target,
      allowsDeferredCalls: true,
      eventTypeString: eventTypeString,
      callbackfunc: callbackfunc,
      handlerFunc: wheelHandlerFunc,
      useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
  }
  function _emscripten_set_wheel_callback_on_thread(
    target,
    userData,
    useCapture,
    callbackfunc,
    targetThread
  ) {
    target = findEventTarget(target);
    if (typeof target.onwheel !== "undefined") {
      registerWheelEventCallback(
        target,
        userData,
        useCapture,
        callbackfunc,
        9,
        "wheel",
        targetThread
      );
      return 0;
    } else {
      return -1;
    }
  }
  function _emscripten_sleep() {
    throw "Please compile your program with async support in order to use asynchronous operations like emscripten_sleep";
  }
  function _emscripten_thread_sleep(msecs) {
    var start = _emscripten_get_now();
    while (_emscripten_get_now() - start < msecs) {}
  }
  var ENV = {};
  function getExecutableName() {
    return thisProgram || "./this.program";
  }
  function getEnvStrings() {
    if (!getEnvStrings.strings) {
      var lang =
        (
          (typeof navigator === "object" &&
            navigator.languages &&
            navigator.languages[0]) ||
          "C"
        ).replace("-", "_") + ".UTF-8";
      var env = {
        USER: "web_user",
        LOGNAME: "web_user",
        PATH: "/",
        PWD: "/",
        HOME: "/home/web_user",
        LANG: lang,
        _: getExecutableName(),
      };
      for (var x in ENV) {
        if (ENV[x] === undefined) delete env[x];
        else env[x] = ENV[x];
      }
      var strings = [];
      for (var x in env) {
        strings.push(x + "=" + env[x]);
      }
      getEnvStrings.strings = strings;
    }
    return getEnvStrings.strings;
  }
  function _environ_get(__environ, environ_buf) {
    try {
      var bufSize = 0;
      getEnvStrings().forEach(function (string, i) {
        var ptr = environ_buf + bufSize;
        HEAP32[(__environ + i * 4) >> 2] = ptr;
        writeAsciiToMemory(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _environ_sizes_get(penviron_count, penviron_buf_size) {
    try {
      var strings = getEnvStrings();
      HEAP32[penviron_count >> 2] = strings.length;
      var bufSize = 0;
      strings.forEach(function (string) {
        bufSize += string.length + 1;
      });
      HEAP32[penviron_buf_size >> 2] = bufSize;
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _fd_close(fd) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _fd_read(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = SYSCALLS.doReadv(stream, iov, iovcnt);
      HEAP32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var HIGH_OFFSET = 4294967296;
      var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
      var DOUBLE_LIMIT = 9007199254740992;
      if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
        return -61;
      }
      FS.llseek(stream, offset, whence);
      (tempI64 = [
        stream.position >>> 0,
        ((tempDouble = stream.position),
        +Math.abs(tempDouble) >= 1
          ? tempDouble > 0
            ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) |
                0) >>>
              0
            : ~~+Math.ceil(
                (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
              ) >>> 0
          : 0),
      ]),
        (HEAP32[newOffset >> 2] = tempI64[0]),
        (HEAP32[(newOffset + 4) >> 2] = tempI64[1]);
      if (stream.getdents && offset === 0 && whence === 0)
        stream.getdents = null;
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _fd_write(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = SYSCALLS.doWritev(stream, iov, iovcnt);
      HEAP32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
      return e.errno;
    }
  }
  function _gettimeofday(ptr) {
    var now = Date.now();
    HEAP32[ptr >> 2] = (now / 1e3) | 0;
    HEAP32[(ptr + 4) >> 2] = ((now % 1e3) * 1e3) | 0;
    return 0;
  }
  function _setTempRet0(val) {
    setTempRet0(val);
  }
  function _sigaction(signum, act, oldact) {
    return 0;
  }
  var __sigalrm_handler = 0;
  function _signal(sig, func) {
    if (sig == 14) {
      __sigalrm_handler = func;
    } else {
    }
    return 0;
  }
  var FSNode = function (parent, name, mode, rdev) {
    if (!parent) {
      parent = this;
    }
    this.parent = parent;
    this.mount = parent.mount;
    this.mounted = null;
    this.id = FS.nextInode++;
    this.name = name;
    this.mode = mode;
    this.node_ops = {};
    this.stream_ops = {};
    this.rdev = rdev;
  };
  var readMode = 292 | 73;
  var writeMode = 146;
  Object.defineProperties(FSNode.prototype, {
    read: {
      get: function () {
        return (this.mode & readMode) === readMode;
      },
      set: function (val) {
        val ? (this.mode |= readMode) : (this.mode &= ~readMode);
      },
    },
    write: {
      get: function () {
        return (this.mode & writeMode) === writeMode;
      },
      set: function (val) {
        val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
      },
    },
    isFolder: {
      get: function () {
        return FS.isDir(this.mode);
      },
    },
    isDevice: {
      get: function () {
        return FS.isChrdev(this.mode);
      },
    },
  });
  FS.FSNode = FSNode;
  FS.staticInit();
  Module["FS_createPath"] = FS.createPath;
  Module["FS_createDataFile"] = FS.createDataFile;
  Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
  Module["FS_createLazyFile"] = FS.createLazyFile;
  Module["FS_createDevice"] = FS.createDevice;
  Module["FS_unlink"] = FS.unlink;
  embind_init_charCodes();
  BindingError = Module["BindingError"] = extendError(Error, "BindingError");
  InternalError = Module["InternalError"] = extendError(Error, "InternalError");
  init_emval();
  Module["requestFullscreen"] = function Module_requestFullscreen(
    lockPointer,
    resizeCanvas
  ) {
    Browser.requestFullscreen(lockPointer, resizeCanvas);
  };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(
    func
  ) {
    Browser.requestAnimationFrame(func);
  };
  Module["setCanvasSize"] = function Module_setCanvasSize(
    width,
    height,
    noUpdates
  ) {
    Browser.setCanvasSize(width, height, noUpdates);
  };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() {
    Browser.mainLoop.pause();
  };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() {
    Browser.mainLoop.resume();
  };
  Module["getUserMedia"] = function Module_getUserMedia() {
    Browser.getUserMedia();
  };
  Module["createContext"] = function Module_createContext(
    canvas,
    useWebGL,
    setInModule,
    webGLContextAttributes
  ) {
    return Browser.createContext(
      canvas,
      useWebGL,
      setInModule,
      webGLContextAttributes
    );
  };
  var GLctx;
  for (var i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));
  var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
  for (var i = 0; i < 288; ++i) {
    miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(
      0,
      i + 1
    );
  }
  var __miniTempWebGLIntBuffersStorage = new Int32Array(288);
  for (var i = 0; i < 288; ++i) {
    __miniTempWebGLIntBuffers[i] = __miniTempWebGLIntBuffersStorage.subarray(
      0,
      i + 1
    );
  }
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(
      stringy,
      u8array,
      0,
      u8array.length
    );
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }
  var asmLibraryArg = {
    W: ___cxa_allocate_exception,
    V: ___cxa_throw,
    Sa: ___sys_chdir,
    R: ___sys_fcntl64,
    Ua: ___sys_ioctl,
    Wa: ___sys_mkdir,
    Va: ___sys_open,
    Ma: __embind_register_bigint,
    Da: __embind_register_bool,
    Ca: __embind_register_emval,
    o: __embind_register_float,
    c: __embind_register_integer,
    b: __embind_register_memory_view,
    p: __embind_register_std_string,
    j: __embind_register_std_wstring,
    Ea: __embind_register_void,
    m: _abort,
    g: _clock_gettime,
    Ha: _dlclose,
    kd: _eglBindAPI,
    qa: _eglChooseConfig,
    sb: _eglCreateContext,
    Pb: _eglCreateWindowSurface,
    Db: _eglDestroyContext,
    _b: _eglDestroySurface,
    Ba: _eglGetConfigAttrib,
    U: _eglGetDisplay,
    hb: _eglGetError,
    Fd: _eglInitialize,
    jc: _eglMakeCurrent,
    Ya: _eglQueryString,
    uc: _eglSwapBuffers,
    Fc: _eglSwapInterval,
    fa: _eglTerminate,
    $c: _eglWaitGL,
    Qc: _eglWaitNative,
    a: _emscripten_asm_const_int,
    Ia: _emscripten_exit_fullscreen,
    Ka: _emscripten_exit_pointerlock,
    i: _emscripten_get_device_pixel_ratio,
    e: _emscripten_get_element_css_size,
    s: _emscripten_get_gamepad_status,
    Ga: _emscripten_get_num_gamepads,
    ga: _emscripten_glActiveTexture,
    ea: _emscripten_glAttachShader,
    xa: _emscripten_glBeginQueryEXT,
    da: _emscripten_glBindAttribLocation,
    ca: _emscripten_glBindBuffer,
    ba: _emscripten_glBindFramebuffer,
    aa: _emscripten_glBindRenderbuffer,
    $: _emscripten_glBindTexture,
    oa: _emscripten_glBindVertexArrayOES,
    _: _emscripten_glBlendColor,
    Z: _emscripten_glBlendEquation,
    Y: _emscripten_glBlendEquationSeparate,
    X: _emscripten_glBlendFunc,
    Ed: _emscripten_glBlendFuncSeparate,
    Dd: _emscripten_glBufferData,
    Cd: _emscripten_glBufferSubData,
    Bd: _emscripten_glCheckFramebufferStatus,
    Ad: _emscripten_glClear,
    zd: _emscripten_glClearColor,
    yd: _emscripten_glClearDepthf,
    xd: _emscripten_glClearStencil,
    wd: _emscripten_glColorMask,
    vd: _emscripten_glCompileShader,
    ud: _emscripten_glCompressedTexImage2D,
    td: _emscripten_glCompressedTexSubImage2D,
    sd: _emscripten_glCopyTexImage2D,
    rd: _emscripten_glCopyTexSubImage2D,
    qd: _emscripten_glCreateProgram,
    pd: _emscripten_glCreateShader,
    od: _emscripten_glCullFace,
    nd: _emscripten_glDeleteBuffers,
    md: _emscripten_glDeleteFramebuffers,
    ld: _emscripten_glDeleteProgram,
    za: _emscripten_glDeleteQueriesEXT,
    jd: _emscripten_glDeleteRenderbuffers,
    id: _emscripten_glDeleteShader,
    hd: _emscripten_glDeleteTextures,
    na: _emscripten_glDeleteVertexArraysOES,
    gd: _emscripten_glDepthFunc,
    fd: _emscripten_glDepthMask,
    ed: _emscripten_glDepthRangef,
    dd: _emscripten_glDetachShader,
    cd: _emscripten_glDisable,
    bd: _emscripten_glDisableVertexAttribArray,
    ad: _emscripten_glDrawArrays,
    ja: _emscripten_glDrawArraysInstancedANGLE,
    ka: _emscripten_glDrawBuffersWEBGL,
    _c: _emscripten_glDrawElements,
    ia: _emscripten_glDrawElementsInstancedANGLE,
    Zc: _emscripten_glEnable,
    Yc: _emscripten_glEnableVertexAttribArray,
    wa: _emscripten_glEndQueryEXT,
    Xc: _emscripten_glFinish,
    Wc: _emscripten_glFlush,
    Vc: _emscripten_glFramebufferRenderbuffer,
    Uc: _emscripten_glFramebufferTexture2D,
    Tc: _emscripten_glFrontFace,
    Sc: _emscripten_glGenBuffers,
    Pc: _emscripten_glGenFramebuffers,
    Aa: _emscripten_glGenQueriesEXT,
    Oc: _emscripten_glGenRenderbuffers,
    Nc: _emscripten_glGenTextures,
    ma: _emscripten_glGenVertexArraysOES,
    Rc: _emscripten_glGenerateMipmap,
    Mc: _emscripten_glGetActiveAttrib,
    Lc: _emscripten_glGetActiveUniform,
    Kc: _emscripten_glGetAttachedShaders,
    Jc: _emscripten_glGetAttribLocation,
    Ic: _emscripten_glGetBooleanv,
    Hc: _emscripten_glGetBufferParameteriv,
    Gc: _emscripten_glGetError,
    Ec: _emscripten_glGetFloatv,
    Dc: _emscripten_glGetFramebufferAttachmentParameteriv,
    Cc: _emscripten_glGetIntegerv,
    Ac: _emscripten_glGetProgramInfoLog,
    Bc: _emscripten_glGetProgramiv,
    ra: _emscripten_glGetQueryObjecti64vEXT,
    ta: _emscripten_glGetQueryObjectivEXT,
    pa: _emscripten_glGetQueryObjectui64vEXT,
    sa: _emscripten_glGetQueryObjectuivEXT,
    ua: _emscripten_glGetQueryivEXT,
    zc: _emscripten_glGetRenderbufferParameteriv,
    xc: _emscripten_glGetShaderInfoLog,
    wc: _emscripten_glGetShaderPrecisionFormat,
    vc: _emscripten_glGetShaderSource,
    yc: _emscripten_glGetShaderiv,
    tc: _emscripten_glGetString,
    sc: _emscripten_glGetTexParameterfv,
    rc: _emscripten_glGetTexParameteriv,
    oc: _emscripten_glGetUniformLocation,
    qc: _emscripten_glGetUniformfv,
    pc: _emscripten_glGetUniformiv,
    lc: _emscripten_glGetVertexAttribPointerv,
    nc: _emscripten_glGetVertexAttribfv,
    mc: _emscripten_glGetVertexAttribiv,
    kc: _emscripten_glHint,
    ic: _emscripten_glIsBuffer,
    hc: _emscripten_glIsEnabled,
    gc: _emscripten_glIsFramebuffer,
    fc: _emscripten_glIsProgram,
    ya: _emscripten_glIsQueryEXT,
    ec: _emscripten_glIsRenderbuffer,
    dc: _emscripten_glIsShader,
    cc: _emscripten_glIsTexture,
    la: _emscripten_glIsVertexArrayOES,
    bc: _emscripten_glLineWidth,
    ac: _emscripten_glLinkProgram,
    $b: _emscripten_glPixelStorei,
    Zb: _emscripten_glPolygonOffset,
    va: _emscripten_glQueryCounterEXT,
    Yb: _emscripten_glReadPixels,
    Xb: _emscripten_glReleaseShaderCompiler,
    Wb: _emscripten_glRenderbufferStorage,
    Vb: _emscripten_glSampleCoverage,
    Ub: _emscripten_glScissor,
    Tb: _emscripten_glShaderBinary,
    Sb: _emscripten_glShaderSource,
    Rb: _emscripten_glStencilFunc,
    Qb: _emscripten_glStencilFuncSeparate,
    Ob: _emscripten_glStencilMask,
    Nb: _emscripten_glStencilMaskSeparate,
    Mb: _emscripten_glStencilOp,
    Lb: _emscripten_glStencilOpSeparate,
    Kb: _emscripten_glTexImage2D,
    Jb: _emscripten_glTexParameterf,
    Ib: _emscripten_glTexParameterfv,
    Hb: _emscripten_glTexParameteri,
    Gb: _emscripten_glTexParameteriv,
    Fb: _emscripten_glTexSubImage2D,
    Cb: _emscripten_glUniform1f,
    Bb: _emscripten_glUniform1fv,
    Ab: _emscripten_glUniform1i,
    zb: _emscripten_glUniform1iv,
    yb: _emscripten_glUniform2f,
    xb: _emscripten_glUniform2fv,
    wb: _emscripten_glUniform2i,
    vb: _emscripten_glUniform2iv,
    ub: _emscripten_glUniform3f,
    tb: _emscripten_glUniform3fv,
    rb: _emscripten_glUniform3i,
    qb: _emscripten_glUniform3iv,
    pb: _emscripten_glUniform4f,
    ob: _emscripten_glUniform4fv,
    nb: _emscripten_glUniform4i,
    mb: _emscripten_glUniform4iv,
    lb: _emscripten_glUniformMatrix2fv,
    kb: _emscripten_glUniformMatrix3fv,
    jb: _emscripten_glUniformMatrix4fv,
    ib: _emscripten_glUseProgram,
    gb: _emscripten_glValidateProgram,
    fb: _emscripten_glVertexAttrib1f,
    eb: _emscripten_glVertexAttrib1fv,
    db: _emscripten_glVertexAttrib2f,
    cb: _emscripten_glVertexAttrib2fv,
    bb: _emscripten_glVertexAttrib3f,
    ab: _emscripten_glVertexAttrib3fv,
    $a: _emscripten_glVertexAttrib4f,
    _a: _emscripten_glVertexAttrib4fv,
    ha: _emscripten_glVertexAttribDivisorANGLE,
    Za: _emscripten_glVertexAttribPointer,
    Xa: _emscripten_glViewport,
    n: _emscripten_has_asyncify,
    Na: _emscripten_memcpy_big,
    Ja: _emscripten_request_fullscreen_strategy,
    P: _emscripten_request_pointerlock,
    Oa: _emscripten_resize_heap,
    t: _emscripten_sample_gamepad_data,
    u: _emscripten_set_beforeunload_callback_on_thread,
    G: _emscripten_set_blur_callback_on_thread,
    h: _emscripten_set_canvas_element_size,
    k: _emscripten_set_element_css_size,
    H: _emscripten_set_focus_callback_on_thread,
    x: _emscripten_set_fullscreenchange_callback_on_thread,
    r: _emscripten_set_gamepadconnected_callback_on_thread,
    q: _emscripten_set_gamepaddisconnected_callback_on_thread,
    A: _emscripten_set_keydown_callback_on_thread,
    y: _emscripten_set_keypress_callback_on_thread,
    z: _emscripten_set_keyup_callback_on_thread,
    Eb: _emscripten_set_main_loop_arg,
    M: _emscripten_set_mousedown_callback_on_thread,
    K: _emscripten_set_mouseenter_callback_on_thread,
    J: _emscripten_set_mouseleave_callback_on_thread,
    N: _emscripten_set_mousemove_callback_on_thread,
    L: _emscripten_set_mouseup_callback_on_thread,
    B: _emscripten_set_pointerlockchange_callback_on_thread,
    w: _emscripten_set_resize_callback_on_thread,
    C: _emscripten_set_touchcancel_callback_on_thread,
    E: _emscripten_set_touchend_callback_on_thread,
    D: _emscripten_set_touchmove_callback_on_thread,
    F: _emscripten_set_touchstart_callback_on_thread,
    v: _emscripten_set_visibilitychange_callback_on_thread,
    I: _emscripten_set_wheel_callback_on_thread,
    l: _emscripten_sleep,
    Ra: _emscripten_thread_sleep,
    Pa: _environ_get,
    Qa: _environ_sizes_get,
    O: _exit,
    T: _fd_close,
    Ta: _fd_read,
    La: _fd_seek,
    S: _fd_write,
    f: _gettimeofday,
    Q: _setTempRet0,
    d: _sigaction,
    Fa: _signal,
  };
  var asm = createWasm();
  var ___wasm_call_ctors = (Module["___wasm_call_ctors"] = function () {
    return (___wasm_call_ctors = Module["___wasm_call_ctors"] =
      Module["asm"]["Hd"]).apply(null, arguments);
  });
  var _malloc = (Module["_malloc"] = function () {
    return (_malloc = Module["_malloc"] = Module["asm"]["Jd"]).apply(
      null,
      arguments
    );
  });
  var _free = (Module["_free"] = function () {
    return (_free = Module["_free"] = Module["asm"]["Kd"]).apply(
      null,
      arguments
    );
  });
  var _main = (Module["_main"] = function () {
    return (_main = Module["_main"] = Module["asm"]["Ld"]).apply(
      null,
      arguments
    );
  });
  var ___errno_location = (Module["___errno_location"] = function () {
    return (___errno_location = Module["___errno_location"] =
      Module["asm"]["Md"]).apply(null, arguments);
  });
  var ___getTypeName = (Module["___getTypeName"] = function () {
    return (___getTypeName = Module["___getTypeName"] =
      Module["asm"]["Nd"]).apply(null, arguments);
  });
  var ___embind_register_native_and_builtin_types = (Module[
    "___embind_register_native_and_builtin_types"
  ] = function () {
    return (___embind_register_native_and_builtin_types = Module[
      "___embind_register_native_and_builtin_types"
    ] =
      Module["asm"]["Od"]).apply(null, arguments);
  });
  var stackSave = (Module["stackSave"] = function () {
    return (stackSave = Module["stackSave"] = Module["asm"]["Pd"]).apply(
      null,
      arguments
    );
  });
  var stackRestore = (Module["stackRestore"] = function () {
    return (stackRestore = Module["stackRestore"] = Module["asm"]["Qd"]).apply(
      null,
      arguments
    );
  });
  var stackAlloc = (Module["stackAlloc"] = function () {
    return (stackAlloc = Module["stackAlloc"] = Module["asm"]["Rd"]).apply(
      null,
      arguments
    );
  });
  var dynCall_jiji = (Module["dynCall_jiji"] = function () {
    return (dynCall_jiji = Module["dynCall_jiji"] = Module["asm"]["Sd"]).apply(
      null,
      arguments
    );
  });
  var dynCall_ji = (Module["dynCall_ji"] = function () {
    return (dynCall_ji = Module["dynCall_ji"] = Module["asm"]["Td"]).apply(
      null,
      arguments
    );
  });
  var dynCall_iiji = (Module["dynCall_iiji"] = function () {
    return (dynCall_iiji = Module["dynCall_iiji"] = Module["asm"]["Ud"]).apply(
      null,
      arguments
    );
  });
  Module["addRunDependency"] = addRunDependency;
  Module["removeRunDependency"] = removeRunDependency;
  Module["FS_createPath"] = FS.createPath;
  Module["FS_createDataFile"] = FS.createDataFile;
  Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
  Module["FS_createLazyFile"] = FS.createLazyFile;
  Module["FS_createDevice"] = FS.createDevice;
  Module["FS_unlink"] = FS.unlink;
  var calledRun;
  function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status;
  }
  var calledMain = false;
  dependenciesFulfilled = function runCaller() {
    if (!calledRun) run();
    if (!calledRun) dependenciesFulfilled = runCaller;
  };
  function callMain(args) {
    var entryFunction = Module["_main"];
    args = args || [];
    var argc = args.length + 1;
    var argv = stackAlloc((argc + 1) * 4);
    HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
    for (var i = 1; i < argc; i++) {
      HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
    }
    HEAP32[(argv >> 2) + argc] = 0;
    try {
      var ret = entryFunction(argc, argv);
      exit(ret, true);
    } catch (e) {
      if (e instanceof ExitStatus) {
        return;
      } else if (e == "unwind") {
        return;
      } else {
        var toLog = e;
        if (e && typeof e === "object" && e.stack) {
          toLog = [e, e.stack];
        }
        err("exception thrown: " + toLog);
        quit_(1, e);
      }
    } finally {
      calledMain = true;
    }
  }
  function run(args) {
    args = args || arguments_;
    if (runDependencies > 0) {
      return;
    }
    preRun();
    if (runDependencies > 0) {
      return;
    }
    function doRun() {
      if (calledRun) return;
      calledRun = true;
      Module["calledRun"] = true;
      if (ABORT) return;
      Module.canvas = canvas;
      initRuntime();
      preMain();
      if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
      if (shouldRunNow) callMain(args);
      postRun();
    }
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(function () {
        setTimeout(function () {
          Module["setStatus"]("");
        }, 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  Module["run"] = run;
  function exit(status, implicit) {
    EXITSTATUS = status;
    if (implicit && keepRuntimeAlive() && status === 0) {
      return;
    }
    if (keepRuntimeAlive()) {
    } else {
      exitRuntime();
      if (Module["onExit"]) Module["onExit"](status);
      ABORT = true;
    }
    quit_(status, new ExitStatus(status));
  }
  if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function")
      Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
      Module["preInit"].pop()();
    }
  }
  var shouldRunNow = true;
  if (Module["noInitialRun"]) shouldRunNow = false;
  console.log(Module);
  run();
  MASTER_CALLBACK(exit);
  return Module;
};

return { RUN };
