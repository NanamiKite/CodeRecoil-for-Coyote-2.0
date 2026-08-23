const vscode = require("vscode");

const { CoyoteController } = require("./coyote/CoyoteController");

const { CoyoteSidebarProvider } = require("./ui/CoyoteSidebarProvider");

function activate(context) {
  console.log("Coyote 2.0 Code Punisher activated");

  const controller = new CoyoteController();

  const sidebar = new CoyoteSidebarProvider(context.extensionUri, controller);

  console.log("Registering Coyote sidebar provider...");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "coyotePunisher.sidebar",

      sidebar,
    ),
  );

  console.log("Coyote sidebar provider registered.");

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.connect", async () => {
      try {
        await controller.connect();

        sidebar.update();

        vscode.window.showInformationMessage("Coyote 2.0 已连接");
      } catch (error) {
        console.error(error);

        vscode.window.showErrorMessage("Coyote 连接失败: " + error.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.disconnect", async () => {
      await controller.disconnect();

      sidebar.update();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "coyotePunisher.emergencyStop",
      async () => {
        try {
          await controller.emergencyStop();

          sidebar.update();
        } catch (error) {
          vscode.window.showErrorMessage("Coyote 停止失败: " + error.message);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.manualTest", async () => {
      try {
        await controller.test();

        sidebar.update();
      } catch (error) {
        vscode.window.showErrorMessage("Coyote 测试失败: " + error.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.setIntensity", async () => {
      const a = await vscode.window.showInputBox({
        prompt: "Channel A intensity",
        value: "10",
      });

      if (a === undefined) {
        return;
      }

      const b = await vscode.window.showInputBox({
        prompt: "Channel B intensity",
        value: "0",
      });

      if (b === undefined) {
        return;
      }

      try {
        await controller.setIntensity(Number(a), Number(b));

        sidebar.update();
      } catch (error) {
        vscode.window.showErrorMessage("设置失败: " + error.message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      let errorCount = 0;

      for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
        for (const diagnostic of diagnostics) {
          if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
            errorCount++;
          }
        }
      }

      sidebar.setErrorCount(errorCount);
    }),
  );

  context.subscriptions.push({
    dispose() {
      controller.dispose();
    },
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
