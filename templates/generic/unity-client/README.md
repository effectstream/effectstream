# Frontend - Unity integration

This package contains example integration with [Unity Engine](https://unity.com/).

# Middleware

The Middleware is the component of the stack that enables your game frontend to interact with both the blockchain and the game node.

This integration is based on [official guide](https://docs.unity3d.com/Manual/webgl-interactingwithbrowserscripting.html) by Unity. We recommend to read through that as well to get a deeper understanding.

When you do any changes to the middleware module you need to make it available for Unity. We prepared a script that compiles every piece of JS into a single file with `process.env` calls replaced by their values.

- If you followed the initial standalone guide then you should have a `.env.development` configuration ready in the parent folder of this template
- run `npm run pack:middleware` from the root of this template or `npm run build` within the middleware module
- if you wish to use another config file set `NODE_ENV` to a custom value and make sure `.env.{NODE_ENV}` file is present in the parent folder of this template
- afterwards take the output from `packaged/paimaMiddleware.js` and place it into your WebGL template (by default in `Assets/WebGLTemplates/paima`)

# Unity Editor Gameplay

Unity Editor has one limitation regarding the code it's able to execute: you can't call JS code from the Editor, that is only possible with a WebGL build.

When running the game, every call to our middleware is mocked by a very simple logic that you can find in `Query.cs`. If you want to test with a real responses you need to [deploy](#deployment) the game.

# Deployment

When you want to deploy your game simply copy the Unity build output into the folder used by your server to serve html (`/www/html/`). You can setup local server by following the guide in the next section.

## Initial setup

You need a specific webserver setup for deployment, in order to ensure that it loads properly and auto-unpacks the `.gz` files. This guide and code samples below are based on official [Server configuration for WebGL](https://docs.unity3d.com/Manual/webgl-server-configuration-code-samples.html).

- Install WebGL build support for Unity and switch to WebGL platform
- Install [nginx](https://www.nginx.com/resources/wiki/start/topics/tutorials/install/#official-debian-ubuntu-packages)
- Add following unity specific config to the default config located at `/etc/nginx/sites-enabled/default` and restart nginx `sudo systemctl restart nginx` afterwards

```
# Add the following config within http server configuration
# ...

# On-disk Brotli-precompressed data files should be served with compression enabled:
location ~ .+\.(data|symbols\.json)\.br$ {
    # Because this file is already pre-compressed on disk, disable the on-demand compression on it.
    # Otherwise nginx would attempt double compression.
    gzip off;
    add_header Content-Encoding br;
    default_type application/octet-stream;
}

# On-disk Brotli-precompressed JavaScript code files:
location ~ .+\.js\.br$ {
    gzip off; # Do not attempt dynamic gzip compression on an already compressed file
    add_header Content-Encoding br;
    default_type application/javascript;
}

# On-disk Brotli-precompressed WebAssembly files:
location ~ .+\.wasm\.br$ {
    gzip off; # Do not attempt dynamic gzip compression on an already compressed file
    add_header Content-Encoding br;
    # Enable streaming WebAssembly compilation by specifying the correct MIME type for
    # Wasm files.
    default_type application/wasm;
}

# On-disk gzip-precompressed data files should be served with compression enabled:
location ~ .+\.(data|symbols\.json)\.gz$ {
    gzip off; # Do not attempt dynamic gzip compression on an already compressed file
    add_header Content-Encoding gzip;
    default_type application/octet-stream;
}

# On-disk gzip-precompressed JavaScript code files:
location ~ .+\.js\.gz$ {
    gzip off; # Do not attempt dynamic gzip compression on an already compressed file
    add_header Content-Encoding gzip;
    default_type application/javascript;
}

# On-disk gzip-precompressed WebAssembly files:
location ~ .+\.wasm\.gz$ {
    gzip off; # Do not attempt dynamic gzip compression on an already compressed file
    add_header Content-Encoding gzip;
    # Enable streaming WebAssembly compilation by specifying the correct MIME type for
    # Wasm files.
    default_type application/wasm;
}
```
