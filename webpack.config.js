const webpack = require("webpack");
const path = require("path");

let config = {
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "./public"),
        filename: "./bundle.js"
    },
    node: {
        fs: 'empty'
    },
    // devServer: {
    //     contentBase: path.resolve(__dirname, "./public"),
    //     historyApiFallback: true,
    //     inline: true,
    //     open: true,
    //     hot: true
    // },
    devtool: "eval-source-map"
}

module.exports = config;