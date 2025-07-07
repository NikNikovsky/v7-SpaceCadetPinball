const shellPid = +env.get("shell_pid");
const { proc } = await load("js/process.js");

runApp(proc, $METADATA, shellPid);
