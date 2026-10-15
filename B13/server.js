const coap = require("coap");

const PORT = 5683;

// false: cố tình không phản hồi để quan sát retransmission
// true : server phản hồi "OK"
const SEND_RESPONSE = false;

const server = coap.createServer();

server.on("request", (req, res) => {
    const payload = req.payload.toString();

    console.log("\nĐã nhận gói CoAP:");
    console.log("Method :", req.method);
    console.log("URL    :", req.url);
    console.log("Payload:", payload);

    if (SEND_RESPONSE) {
        res.code = "2.04";
        res.end("OK");
        console.log("Đã phản hồi: OK");
    } else {
        console.log("Cố tình không phản hồi để quan sát retransmission.");
    }
});

server.on("error", (error) => {
    console.error("Lỗi CoAP server:", error);
});

server.listen(PORT, () => {
    console.log(`CoAP server đang chạy tại cổng UDP ${PORT}`);
    console.log(`Chế độ phản hồi: ${SEND_RESPONSE ? "BẬT" : "TẮT"}`);
});