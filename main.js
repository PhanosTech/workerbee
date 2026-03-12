require('ts-node').register({
    compilerOptions: {
        module: "CommonJS"
    }
});
require('./electron/main.ts');
