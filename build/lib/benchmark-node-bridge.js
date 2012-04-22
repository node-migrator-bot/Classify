// include the fs module
var fs = require("fs"),
// sandboxing module
vm = require("vm"),
// path utilities
path = require("path"),
// quick reference to root dir
workdir = path.dirname(path.dirname(__dirname)),
// path the the src dir
srcdir = workdir + "/src",
// path the the perf dir
perfdir = workdir + "/perf",
// read options from commandline
options = JSON.parse(process.argv[2]),
// path to the benchmark library
perfPath = path.join(__dirname, "..", "perf/benchmark.js"),
// misc variables
currentmodule;

// globals needed by qunit sandbox
var sandbox = {
	require : require,
	exports : {},
	setTimeout : setTimeout,
	setInterval : setInterval,
	clearTimeout : clearTimeout,
	clearInterval : clearInterval,
	console : console
};
// window is a circualr reference
sandbox.window = sandbox;

// load the benchmark library into the sandbox
sandbox.Benchmark = require(perfPath);

// keep a reference to the "root" variable
sandbox.root = sandbox.window;

// create a new global test suite
sandbox.___benchmarks = new sandbox.Benchmark.Suite();

// bind the response handlers to the parent process
sandbox.___benchmarks.on("add", function(e) {
	// bind events
	e.target.on("complete", function(e) {
		var data = {
			id : this.id,
			name : this.name,
			stats : this.stats,
			times : this.times,
			count : this.count,
			cycles : this.cycles,
			hz : this.hz
		};
		if (this.error) {
			data.error = this.error.message;
		}

		process.send({
			event : "testDone",
			data : data
		});
	});
});

// notify the parent process that tests are finished
sandbox.___benchmarks.on("complete", function() {
	process.send({
		event : "done",
		data : {}
	});
});

// load source and tests into the sandbox
function load(src, root) {
	// keep appending the source to the sandbox
	src.forEach(function(file) {
		try {
			vm.runInNewContext(fs.readFileSync(root + file, "utf-8"), sandbox, perfPath);
		} catch (e) {
			console.log(e.message + " in " + file);
			process.exit(1);
		}
	});
}

// load dependencies
load(options.depends || [], "");

// load up the source files
load(options.src, srcdir + "/");

// load up the test files
load(options.tests, perfdir + "/");

// start the tests
sandbox.___benchmarks.run({
	async : true,
	queued : true
});