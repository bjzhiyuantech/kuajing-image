function fileToDataUrl(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success(res) {
        const ext = filePath.split(".").pop().toLowerCase();
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
        resolve(`data:${mimeType};base64,${res.data}`);
      },
      fail(error) {
        reject(new Error(error.errMsg || "读取图片失败"));
      }
    });
  });
}

module.exports = {
  fileToDataUrl
};
