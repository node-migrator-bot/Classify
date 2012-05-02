module.exports = (function(root) {

	// execute system commands
	var exec = require("child_process");

	function lpad(str, len, chr) {
		return (Array(len + 1).join(chr || " ") + str).substr(-len);
	}

	function rpad(str, len, chr) {
		return (str + Array(len + 1).join(chr || " ")).substr(0, len);
	}

	function formatNumber(number) {
		number = String(number).split('.');
		return number[0].replace(/(?=(?:\d{3})+$)(?!\b)/g, ',') + (number[1] ? '.' + number[1] : '');
	}

	function processUnitTestResults(results, callback) {
		var error = 0;
		results.forEach(function(test) {
			var message = "  ";
			if (test.error) {
				message += "\x1B[38;5;160m" + rpad(test.name, 25) + "\x1B[0m";
			} else {
				message += rpad(test.name, 25);
			}
			message += lpad(formatNumber(test.hz.toFixed(test.hz < 100 ? 2 : 0)), 12) + " ops/s (\u00B1" + test.stats.rme.toFixed(2) + "%)";
			message += " [" + formatNumber(test.count) + "x in " + test.times.cycle.toFixed(3) + "s]";
			callback.log(message);
			if (test.error) {
				error++;
				callback.log("    \x1B[38;5;160m\u2716 \x1B[0m" + test.error);
			}
		});

		if (error > 0) {
			callback.log("\x1B[38;5;160m\u2716 \x1B[0m" + error + " / " + results.length + " Failed");
		} else {
			callback.log("\x1B[38;5;34m\u2714 \x1B[0mAll benchmarks run successfully!");
		}
		callback.log("");
	}

	function unitNode(options, callback) {
		var child = exec.fork(options.dir.build + "/lib/benchmark-node-bridge.js", [ JSON.stringify({
			src : options.src,
			tests : options.perf
		}) ], {
			env : process.env
		}), results = [], index = 0;

		child.on("message", function(msg) {
			if (msg.event === "testDone") {
				msg.data.index = ++index;
				results.push(msg.data);
			} else if (msg.event === "done") {
				child.kill();
				callback(results);
			}
		});
	}

	function unitPhantom(options, callback) {
		var child = exec.spawn("phantomjs", [ options.dir.build + "/lib/phantom-bridge.js", options.dir.build + "/lib/benchmark-phantom-bridge.html" ], {
			env : process.env
		}), results = [], index = 0;

		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", function(stdout) {
			stdout.toString().split("{\"event\"").forEach(function(data) {
				if (!data) {
					return;
				}
				try {
					var msg = JSON.parse("{\"event\"" + data);
					if (msg.event === "testDone") {
						msg.data.index = ++index;
						results.push(msg.data);
					} else if (msg.event === "done") {
						callback(results);
					}
				} catch (e) {
					throw e;
					return;
				}
			});
		});
		child.on("exit", function(code) {
			// phantomjs doesn't exist
			if (code === 127) {
				callback(true);
			}
		});
	}

	return function(options, source, callback) {
		callback.print("Running benchmarks with Benchmark.js...");
		var tests = [], complete = function(env, results) {
			if (env !== null && results !== true) {
				processUnitTestResults(results, callback);
			}
			if (results === true) {
				callback.log("\x1B[38;5;160m\u2716 \x1B[0mEnvironment " + env + " not found!");
				callback.log("");
			}
			if (tests.length === 0) {
				return callback();
			}
			(tests.shift())();
		};
		if (options.env.node === true) {
			tests.push(function() {
				callback.log("Running in \x1B[39;1mNodeJs\x1B[0m environment...");
				unitNode(options, function(results) {
					complete("NodeJs", results);
				});
			});
		}
		if (options.env.web === true) {
			tests.push(function() {
				callback.log("Running in \x1B[39;1mPhantomJs\x1B[0m environment...");
				unitPhantom(options, function(results) {
					complete("PhantomJs", results);
				});
			});
		}
		// start the unit tests
		complete(null);
	};
})(global);