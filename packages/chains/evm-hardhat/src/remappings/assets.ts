
  import { decodeBase64 } from "jsr:@std/encoding@~1.0.8";
  
  const bundledObject = {
    files:{
      "remappings.hardhat":{
      content:decodeBase64("QG9wZW56ZXBwZWxpbi89bm9kZV9tb2R1bGVzL0BvcGVuemVwcGVsaW4vCkBlZmZlY3RzdHJlYW0vPW5vZGVfbW9kdWxlcy9AZWZmZWN0c3RyZWFtLwo="),
      extension: "txt"
    },
    "remappings.forge":{
      content:decodeBase64("QG9wZW56ZXBwZWxpbi89Li4vLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0BvcGVuemVwcGVsaW4vCkBlZmZlY3RzdHJlYW0vPS4uLy4uLy4uLy4uL25vZGVfbW9kdWxlcy9AZWZmZWN0c3RyZWFtLwo="),
      extension: "txt"
    }
    }
  } 
  export default bundledObject;

