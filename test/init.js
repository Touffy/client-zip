global.atob = s => Buffer.from(s, "base64").toString("binary")
