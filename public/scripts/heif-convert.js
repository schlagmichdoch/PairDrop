function HeifConvert(libheif) {
    this.libheif = libheif;
    this.decoder = new libheif.HeifDecoder();
}


HeifConvert.prototype.convert = async function (buffer) {
    const decodeResult = this.decoder.decode(buffer);
    const image = decodeResult[0];

    let w = image.get_width();
    let h = image.get_height();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(w, h);

    await copyData(imageData, image);

    ctx.putImageData(imageData, 0, 0);
    image.free();
    return canvas;
};

function copyData(dataContainer, image) {
    return new Promise((resolve, reject) => {
        image.display(
            dataContainer,
            function () {
                resolve()
            }
        );
    })
}