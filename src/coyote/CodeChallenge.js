"use strict";
const { EventEmitter } = require("events");

const defaultStory = "你被困在故障代码迷宫。修复错误并保存，随后通过一次 VS Code 构建任务，才能打开出口。";

class CodeChallenge extends EventEmitter {
  constructor() {
    super();
    this.state = { active:false, stage:"idle", story:defaultStory, errors:null, message:"尚未开始闯关" };
  }
  status() { return { ...this.state }; }
  start(story = defaultStory) {
    if (typeof story !== "string" || !story.trim() || story.length > 500) throw new Error("闯关设定须为 1–500 个字符");
    this.state = { active:true, stage:"repair", story:story.trim(), errors:null,
      message:"第一关：修复工作区错误并保存文件", startedAt:Date.now() };
    this.emit("change");
    return this.status();
  }
  stop() {
    this.state = { ...this.state, active:false, stage:"idle", message:"闯关已结束" };
    this.emit("change");
    return this.status();
  }
  observe(kind, errors, buildSucceeded = false) {
    if (!this.state.active || !["save","build"].includes(kind)) return this.status();
    const count = Math.max(0, Math.floor(Number(errors) || 0));
    let { stage, message } = this.state;
    if (stage === "repair") {
      if (kind === "save" && count === 0) {
        stage = "build";
        message = "第一关通过！第二关：运行一次成功的 VS Code 构建任务";
      } else {
        message = count ? `仍有 ${count} 个工作区错误；修复后保存以通过第一关` : "错误已清零；请保存文件以通过第一关";
      }
    } else if (stage === "build") {
      if (kind === "build" && buildSucceeded && count === 0) {
        stage = "complete";
        message = "闯关成功：构建通过且工作区没有错误";
      } else if (kind === "build") {
        message = buildSucceeded ? `构建已结束，但仍有 ${count} 个工作区错误` : "构建未通过；修复后重试 VS Code 构建任务";
      } else if (count) {
        stage = "repair";
        message = `出现 ${count} 个工作区错误；返回第一关`;
      }
    }
    this.state = { ...this.state, stage, errors:count, message, active:stage !== "complete", updatedAt:Date.now() };
    this.emit("change");
    return this.status();
  }
}
module.exports = { CodeChallenge, defaultStory };
