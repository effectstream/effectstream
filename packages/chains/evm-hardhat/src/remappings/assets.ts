
  import { Buffer } from "node:buffer";
  const decodeBase64 = (s: string) => Buffer.from(s, "base64");
  
  const bundledObject = {
    files:{
      "remappings.hardhat":{
      content:decodeBase64("QG9wZW56ZXBwZWxpbi89bm9kZV9tb2R1bGVzL0BvcGVuemVwcGVsaW4vCkBwYWltYS89bm9kZV9tb2R1bGVzL0BwYWltYS8K"),
      extension: "txt"
    },
    "remappings.forge":{
      content:decodeBase64("QG9wZW56ZXBwZWxpbi89Li4vLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0BvcGVuemVwcGVsaW4vCkBwYWltYS89Li4vLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0BwYWltYS8K"),
      extension: "txt"
    }
    }
  } 
  export default bundledObject;

