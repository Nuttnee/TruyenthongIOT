const dgram = require("dgram");

const PORT = 5683;
const server = dgram.createSocket("udp4");

server.on("message", (message, remote) => {
    const typeNumber = (message[0] >> 4) & 0x03;
    const messageTypes = ["CON", "NON", "ACK", "RST"];
    const messageId = message.readUInt16BE(2);

    const payloadMarker = message.indexOf(0xff);
    const payload =
        payloadMarker >= 0
            ? message.subarray(payloadMarker + 1).toString()
            : "";

    console.log("\nĐã nhận gói CoAP nhưng KHÔNG gửi ACK:");
    console.log("Nguồn     :", `${remote.address}:${remote.port}`);
    console.log("Loại      :", messageTypes[typeNumber]);
    console.log("Message ID:", messageId);
    console.log("Payload   :", payload);
});

server.on("error", (error) => {
    console.error("Lỗi server:", error);
});

server.bind(PORT, "0.0.0.0", () => {
    console.log(`No-ACK server đang nghe UDP ${PORT}`);
});