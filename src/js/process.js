const html = await loadHtml("body.html");
const { RUN } = await load("js/pinball.js");

class proc extends ThirdPartyAppProcess {
  exit;
  module;
  constructor(handler, pid, parentPid, app, workingDirectory, ...args) {
    super(handler, pid, parentPid, app, workingDirectory);
    this.workingDirectory = workingDirectory;
  }

  async render() {
    const body = this.getBody();
    body.innerHTML = html;

    this.module = await RUN(body.querySelector("canvas#canvas"), (e) => (this.exit = e));
  }

  async onClose() {
    try {
      await this.exit?.("yes", false);
    } catch {}
	this.module.pauseMainLoop();
	this.module.SDL2.audioContext.close();
	this.module = undefined;
    return true;
  }
}

return { proc };
