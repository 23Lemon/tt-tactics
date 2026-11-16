# 乒乓球发接发技战术分析平台

这是可发布到 GitHub Pages 的版本。它包含球路分析、双方左右手设置、第三板和第四板建议，以及浏览器本地套路库。套路只在当前浏览器和网址下保存。换设备、换浏览器或清除站点数据会使用新的套路库。

## 发布到 GitHub Pages

1. 创建一个 GitHub 仓库，例如 `tt-tactics`。
2. 将解压后的内容上传到仓库根目录，确认根目录下存在 `docs/index.html`。
3. 打开仓库的 **Settings → Pages**。在 **Build and deployment** 选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/docs` 目录，点击 **Save**。发布完成后，该页面会显示网站网址。

GitHub Free 的 Pages 仓库需设为公开。上述步骤会发布 `docs` 中的站点文件。

## 修改并重新发布

需要 Node.js 22.13 或更新版本。修改源文件后重新运行构建，把更新后的 `docs` 一起提交到 `main`。

```sh
npm ci
npm test
npm run build
```

本地开发可用 `npm run dev`，预览构建产物可用 `npm run preview`。
