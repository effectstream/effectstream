
  import { decodeBase64 } from "jsr:@std/encoding@~1.0.8";
  
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

