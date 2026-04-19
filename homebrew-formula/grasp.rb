class Grasp < Formula
  desc "Code architecture visualizer — dependency graph, health score, security scanner"
  homepage "https://github.com/ashfordeOU/grasp"
  url "https://registry.npmjs.org/grasp-mcp-server/-/grasp-mcp-server-3.1.1.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "Elastic-2.0"
  head "https://github.com/ashfordeOU/grasp.git", branch: "main"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/grasp --version")
  end
end
