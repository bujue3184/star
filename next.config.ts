import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许局域网设备访问 dev server（如手机测试）
  allowedDevOrigins: ["192.168.2.14", "localhost", "127.0.0.1"],
};

export default nextConfig;
