import { ak as getDefaultExportFromCjs, al as de, am as Ae, an as Re, ao as Te, ap as be, aq as Ne, ar as me, as as ye, at as he, au as Ee, av as ge } from './index-B5nhZq78.js';

var qrCodeStyling = {exports: {}};

var hasRequiredQrCodeStyling;

function requireQrCodeStyling () {
	if (hasRequiredQrCodeStyling) return qrCodeStyling.exports;
	hasRequiredQrCodeStyling = 1;
	(function (module, exports) {
		!function(t,e){module.exports=e();}(self,(function(){return (()=>{var t={192:(t,e)=>{var r,n,o=function(){var t=function(t,e){var r=t,n=a[e],o=null,i=0,u=null,v=[],w={},m=function(t,e){o=function(t){for(var e=new Array(t),r=0;r<t;r+=1){e[r]=new Array(t);for(var n=0;n<t;n+=1)e[r][n]=null;}return e}(i=4*r+17),b(0,0),b(i-7,0),b(0,i-7),x(),_(),M(t,e),r>=7&&S(t),null==u&&(u=A(r,n,v)),C(u,e);},b=function(t,e){for(var r=-1;r<=7;r+=1)if(!(t+r<=-1||i<=t+r))for(var n=-1;n<=7;n+=1)e+n<=-1||i<=e+n||(o[t+r][e+n]=0<=r&&r<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==r||6==r)||2<=r&&r<=4&&2<=n&&n<=4);},_=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var e=8;e<i-8;e+=1)null==o[6][e]&&(o[6][e]=e%2==0);},x=function(){for(var t=s.getPatternPosition(r),e=0;e<t.length;e+=1)for(var n=0;n<t.length;n+=1){var i=t[e],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var h=-2;h<=2;h+=1)o[i+u][a+h]=-2==u||2==u||-2==h||2==h||0==u&&0==h;}},S=function(t){for(var e=s.getBCHTypeNumber(r),n=0;n<18;n+=1){var a=!t&&1==(e>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a;}for(n=0;n<18;n+=1)a=!t&&1==(e>>n&1),o[n%3+i-8-3][Math.floor(n/3)]=a;},M=function(t,e){for(var r=n<<3|e,a=s.getBCHTypeInfo(r),u=0;u<15;u+=1){var h=!t&&1==(a>>u&1);u<6?o[u][8]=h:u<8?o[u+1][8]=h:o[i-15+u][8]=h;}for(u=0;u<15;u+=1)h=!t&&1==(a>>u&1),u<8?o[8][i-u-1]=h:u<9?o[8][15-u-1+1]=h:o[8][15-u-1]=h;o[i-8][8]=!t;},C=function(t,e){for(var r=-1,n=i-1,a=7,u=0,h=s.getMaskFunction(e),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var l=0;l<2;l+=1)if(null==o[n][c-l]){var d=false;u<t.length&&(d=1==(t[u]>>>a&1)),h(n,c-l)&&(d=!d),o[n][c-l]=d,-1==(a-=1)&&(u+=1,a=7);}if((n+=r)<0||i<=n){n-=r,r=-r;break}}},A=function(t,e,r){for(var n=c.getRSBlocks(t,e),o=l(),i=0;i<r.length;i+=1){var a=r[i];o.put(a.getMode(),4),o.put(a.getLength(),s.getLengthInBits(a.getMode(),t)),a.write(o);}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw "code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(false);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,e){for(var r=0,n=0,o=0,i=new Array(e.length),a=new Array(e.length),u=0;u<e.length;u+=1){var c=e[u].dataCount,l=e[u].totalCount-c;n=Math.max(n,c),o=Math.max(o,l),i[u]=new Array(c);for(var d=0;d<i[u].length;d+=1)i[u][d]=255&t.getBuffer()[d+r];r+=c;var f=s.getErrorCorrectPolynomial(l),g=h(i[u],f.getLength()-1).mod(f);for(a[u]=new Array(f.getLength()-1),d=0;d<a[u].length;d+=1){var p=d+g.getLength()-a[u].length;a[u][d]=p>=0?g.getAt(p):0;}}var v=0;for(d=0;d<e.length;d+=1)v+=e[d].totalCount;var w=new Array(v),y=0;for(d=0;d<n;d+=1)for(u=0;u<e.length;u+=1)d<i[u].length&&(w[y]=i[u][d],y+=1);for(d=0;d<o;d+=1)for(u=0;u<e.length;u+=1)d<a[u].length&&(w[y]=a[u][d],y+=1);return w}(o,n)};w.addData=function(t,e){var r=null;switch(e=e||"Byte"){case "Numeric":r=d(t);break;case "Alphanumeric":r=f(t);break;case "Byte":r=g(t);break;case "Kanji":r=p(t);break;default:throw "mode:"+e}v.push(r),u=null;},w.isDark=function(t,e){if(t<0||i<=t||e<0||i<=e)throw t+","+e;return o[t][e]},w.getModuleCount=function(){return i},w.make=function(){if(r<1){for(var t=1;t<40;t++){for(var e=c.getRSBlocks(t,n),o=l(),i=0;i<v.length;i++){var a=v[i];o.put(a.getMode(),4),o.put(a.getLength(),s.getLengthInBits(a.getMode(),t)),a.write(o);}var u=0;for(i=0;i<e.length;i++)u+=e[i].dataCount;if(o.getLengthInBits()<=8*u)break}r=t;}m(false,function(){for(var t=0,e=0,r=0;r<8;r+=1){m(true,r);var n=s.getLostPoint(w);(0==r||t>n)&&(t=n,e=r);}return e}());},w.createTableTag=function(t,e){t=t||2;var r="";r+='<table style="',r+=" border-width: 0px; border-style: none;",r+=" border-collapse: collapse;",r+=" padding: 0px; margin: "+(e=void 0===e?4*t:e)+"px;",r+='">',r+="<tbody>";for(var n=0;n<w.getModuleCount();n+=1){r+="<tr>";for(var o=0;o<w.getModuleCount();o+=1)r+='<td style="',r+=" border-width: 0px; border-style: none;",r+=" border-collapse: collapse;",r+=" padding: 0px; margin: 0px;",r+=" width: "+t+"px;",r+=" height: "+t+"px;",r+=" background-color: ",r+=w.isDark(n,o)?"#000000":"#ffffff",r+=";",r+='"/>';r+="</tr>";}return (r+="</tbody>")+"</table>"},w.createSvgTag=function(t,e,r,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,e=o.margin,r=o.alt,n=o.title),t=t||2,e=void 0===e?4*t:e,(r="string"==typeof r?{text:r}:r||{}).text=r.text||null,r.id=r.text?r.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,s,u,h=w.getModuleCount()*t+2*e,c="";for(u="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",c+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',c+=o.scalable?"":' width="'+h+'px" height="'+h+'px"',c+=' viewBox="0 0 '+h+" "+h+'" ',c+=' preserveAspectRatio="xMinYMin meet"',c+=n.text||r.text?' role="img" aria-labelledby="'+k([n.id,r.id].join(" ").trim())+'"':"",c+=">",c+=n.text?'<title id="'+k(n.id)+'">'+k(n.text)+"</title>":"",c+=r.text?'<description id="'+k(r.id)+'">'+k(r.text)+"</description>":"",c+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',c+='<path d="',a=0;a<w.getModuleCount();a+=1)for(s=a*t+e,i=0;i<w.getModuleCount();i+=1)w.isDark(a,i)&&(c+="M"+(i*t+e)+","+s+u);return (c+='" stroke="transparent" fill="black"/>')+"</svg>"},w.createDataURL=function(t,e){t=t||2,e=void 0===e?4*t:e;var r=w.getModuleCount()*t+2*e,n=e,o=r-e;return y(r,r,(function(e,r){if(n<=e&&e<o&&n<=r&&r<o){var i=Math.floor((e-n)/t),a=Math.floor((r-n)/t);return w.isDark(a,i)?0:1}return 1}))},w.createImgTag=function(t,e,r){t=t||2,e=void 0===e?4*t:e;var n=w.getModuleCount()*t+2*e,o="";return o+="<img",o+=' src="',o+=w.createDataURL(t,e),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',r&&(o+=' alt="',o+=k(r),o+='"'),o+"/>"};var k=function(t){for(var e="",r=0;r<t.length;r+=1){var n=t.charAt(r);switch(n){case "<":e+="&lt;";break;case ">":e+="&gt;";break;case "&":e+="&amp;";break;case '"':e+="&quot;";break;default:e+=n;}}return e};return w.createASCII=function(t,e){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var e,r,n,o,i,a=1*w.getModuleCount()+2*t,s=t,u=a-t,h={"██":"█","█ ":"▀"," █":"▄","  ":" "},c={"██":"▀","█ ":"▀"," █":" ","  ":" "},l="";for(e=0;e<a;e+=2){for(n=Math.floor((e-s)/1),o=Math.floor((e+1-s)/1),r=0;r<a;r+=1)i="█",s<=r&&r<u&&s<=e&&e<u&&w.isDark(n,Math.floor((r-s)/1))&&(i=" "),s<=r&&r<u&&s<=e+1&&e+1<u&&w.isDark(o,Math.floor((r-s)/1))?i+=" ":i+="█",l+=t<1&&e+1>=u?c[i]:h[i];l+="\n";}return a%2&&t>0?l.substring(0,l.length-a-1)+Array(a+1).join("▀"):l.substring(0,l.length-1)}(e);t-=1,e=void 0===e?2*t:e;var r,n,o,i,a=w.getModuleCount()*t+2*e,s=e,u=a-e,h=Array(t+1).join("██"),c=Array(t+1).join("  "),l="",d="";for(r=0;r<a;r+=1){for(o=Math.floor((r-s)/t),d="",n=0;n<a;n+=1)i=1,s<=n&&n<u&&s<=r&&r<u&&w.isDark(o,Math.floor((n-s)/t))&&(i=0),d+=i?h:c;for(o=0;o<t;o+=1)l+=d+"\n";}return l.substring(0,l.length-1)},w.renderTo2dContext=function(t,e){e=e||2;for(var r=w.getModuleCount(),n=0;n<r;n++)for(var o=0;o<r;o++)t.fillStyle=w.isDark(n,o)?"black":"white",t.fillRect(n*e,o*e,e,e);},w};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var e=[],r=0;r<t.length;r+=1){var n=t.charCodeAt(r);e.push(255&n);}return e}}).default,t.createStringToBytes=function(t,e){var r=function(){for(var r=w(t),n=function(){var t=r.read();if(-1==t)throw "eof";return t},o=0,i={};;){var a=r.read();if(-1==a)break;var s=n(),u=n()<<8|n();i[String.fromCharCode(a<<8|s)]=u,o+=1;}if(o!=e)throw o+" != "+e;return i}(),n="?".charCodeAt(0);return function(t){for(var e=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)e.push(i);else {var a=r[t.charAt(o)];"number"==typeof a?(255&a)==a?e.push(a):(e.push(a>>>8),e.push(255&a)):e.push(n);}}return e}};var e,r,n,o,i,a={L:1,M:0,Q:3,H:2},s=(e=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],r=1335,n=7973,i=function(t){for(var e=0;0!=t;)e+=1,t>>>=1;return e},(o={}).getBCHTypeInfo=function(t){for(var e=t<<10;i(e)-i(r)>=0;)e^=r<<i(e)-i(r);return 21522^(t<<10|e)},o.getBCHTypeNumber=function(t){for(var e=t<<12;i(e)-i(n)>=0;)e^=n<<i(e)-i(n);return t<<12|e},o.getPatternPosition=function(t){return e[t-1]},o.getMaskFunction=function(t){switch(t){case 0:return function(t,e){return (t+e)%2==0};case 1:return function(t,e){return t%2==0};case 2:return function(t,e){return e%3==0};case 3:return function(t,e){return (t+e)%3==0};case 4:return function(t,e){return (Math.floor(t/2)+Math.floor(e/3))%2==0};case 5:return function(t,e){return t*e%2+t*e%3==0};case 6:return function(t,e){return (t*e%2+t*e%3)%2==0};case 7:return function(t,e){return (t*e%3+(t+e)%2)%2==0};default:throw "bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var e=h([1],0),r=0;r<t;r+=1)e=e.multiply(h([1,u.gexp(r)],0));return e},o.getLengthInBits=function(t,e){if(1<=e&&e<10)switch(t){case 1:return 10;case 2:return 9;case 4:case 8:return 8;default:throw "mode:"+t}else if(e<27)switch(t){case 1:return 12;case 2:return 11;case 4:return 16;case 8:return 10;default:throw "mode:"+t}else {if(!(e<41))throw "type:"+e;switch(t){case 1:return 14;case 2:return 13;case 4:return 16;case 8:return 12;default:throw "mode:"+t}}},o.getLostPoint=function(t){for(var e=t.getModuleCount(),r=0,n=0;n<e;n+=1)for(var o=0;o<e;o+=1){for(var i=0,a=t.isDark(n,o),s=-1;s<=1;s+=1)if(!(n+s<0||e<=n+s))for(var u=-1;u<=1;u+=1)o+u<0||e<=o+u||0==s&&0==u||a==t.isDark(n+s,o+u)&&(i+=1);i>5&&(r+=3+i-5);}for(n=0;n<e-1;n+=1)for(o=0;o<e-1;o+=1){var h=0;t.isDark(n,o)&&(h+=1),t.isDark(n+1,o)&&(h+=1),t.isDark(n,o+1)&&(h+=1),t.isDark(n+1,o+1)&&(h+=1),0!=h&&4!=h||(r+=3);}for(n=0;n<e;n+=1)for(o=0;o<e-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(r+=40);for(o=0;o<e;o+=1)for(n=0;n<e-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(r+=40);var c=0;for(o=0;o<e;o+=1)for(n=0;n<e;n+=1)t.isDark(n,o)&&(c+=1);return r+Math.abs(100*c/e/e-50)/5*10},o),u=function(){for(var t=new Array(256),e=new Array(256),r=0;r<8;r+=1)t[r]=1<<r;for(r=8;r<256;r+=1)t[r]=t[r-4]^t[r-5]^t[r-6]^t[r-8];for(r=0;r<255;r+=1)e[t[r]]=r;return {glog:function(t){if(t<1)throw "glog("+t+")";return e[t]},gexp:function(e){for(;e<0;)e+=255;for(;e>=256;)e-=255;return t[e]}}}();function h(t,e){if(void 0===t.length)throw t.length+"/"+e;var r=function(){for(var r=0;r<t.length&&0==t[r];)r+=1;for(var n=new Array(t.length-r+e),o=0;o<t.length-r;o+=1)n[o]=t[o+r];return n}(),n={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var e=new Array(n.getLength()+t.getLength()-1),r=0;r<n.getLength();r+=1)for(var o=0;o<t.getLength();o+=1)e[r+o]^=u.gexp(u.glog(n.getAt(r))+u.glog(t.getAt(o)));return h(e,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var e=u.glog(n.getAt(0))-u.glog(t.getAt(0)),r=new Array(n.getLength()),o=0;o<n.getLength();o+=1)r[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)r[o]^=u.gexp(u.glog(t.getAt(o))+e);return h(r,0).mod(t)}};return n}var c=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],e=function(t,e){var r={};return r.totalCount=t,r.dataCount=e,r},r={getRSBlocks:function(r,n){var o=function(e,r){switch(r){case a.L:return t[4*(e-1)+0];case a.M:return t[4*(e-1)+1];case a.Q:return t[4*(e-1)+2];case a.H:return t[4*(e-1)+3];default:return}}(r,n);if(void 0===o)throw "bad rs block @ typeNumber:"+r+"/errorCorrectionLevel:"+n;for(var i=o.length/3,s=[],u=0;u<i;u+=1)for(var h=o[3*u+0],c=o[3*u+1],l=o[3*u+2],d=0;d<h;d+=1)s.push(e(c,l));return s}};return r}(),l=function(){var t=[],e=0,r={getBuffer:function(){return t},getAt:function(e){var r=Math.floor(e/8);return 1==(t[r]>>>7-e%8&1)},put:function(t,e){for(var n=0;n<e;n+=1)r.putBit(1==(t>>>e-n-1&1));},getLengthInBits:function(){return e},putBit:function(r){var n=Math.floor(e/8);t.length<=n&&t.push(0),r&&(t[n]|=128>>>e%8),e+=1;}};return r},d=function(t){var e=t,r={getMode:function(){return 1},getLength:function(t){return e.length},write:function(t){for(var r=e,o=0;o+2<r.length;)t.put(n(r.substring(o,o+3)),10),o+=3;o<r.length&&(r.length-o==1?t.put(n(r.substring(o,o+1)),4):r.length-o==2&&t.put(n(r.substring(o,o+2)),7));}},n=function(t){for(var e=0,r=0;r<t.length;r+=1)e=10*e+o(t.charAt(r));return e},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw "illegal char :"+t};return r},f=function(t){var e=t,r={getMode:function(){return 2},getLength:function(t){return e.length},write:function(t){for(var r=e,o=0;o+1<r.length;)t.put(45*n(r.charAt(o))+n(r.charAt(o+1)),11),o+=2;o<r.length&&t.put(n(r.charAt(o)),6);}},n=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case " ":return 36;case "$":return 37;case "%":return 38;case "*":return 39;case "+":return 40;case "-":return 41;case ".":return 42;case "/":return 43;case ":":return 44;default:throw "illegal char :"+t}};return r},g=function(e){var r=t.stringToBytes(e);return {getMode:function(){return 4},getLength:function(t){return r.length},write:function(t){for(var e=0;e<r.length;e+=1)t.put(r[e],8);}}},p=function(e){var r=t.stringToBytesFuncs.SJIS;if(!r)throw "sjis not supported.";!function(t,e){var n=r("友");if(2!=n.length||38726!=(n[0]<<8|n[1]))throw "sjis not supported."}();var n=r(e);return {getMode:function(){return 8},getLength:function(t){return ~~(n.length/2)},write:function(t){for(var e=n,r=0;r+1<e.length;){var o=(255&e[r])<<8|255&e[r+1];if(33088<=o&&o<=40956)o-=33088;else {if(!(57408<=o&&o<=60351))throw "illegal char at "+(r+1)+"/"+o;o-=49472;}o=192*(o>>>8&255)+(255&o),t.put(o,13),r+=2;}if(r<e.length)throw "illegal char at "+(r+1)}}},v=function(){var t=[],e={writeByte:function(e){t.push(255&e);},writeShort:function(t){e.writeByte(t),e.writeByte(t>>>8);},writeBytes:function(t,r,n){r=r||0,n=n||t.length;for(var o=0;o<n;o+=1)e.writeByte(t[o+r]);},writeString:function(t){for(var r=0;r<t.length;r+=1)e.writeByte(t.charCodeAt(r));},toByteArray:function(){return t},toString:function(){var e="";e+="[";for(var r=0;r<t.length;r+=1)r>0&&(e+=","),e+=t[r];return e+"]"}};return e},w=function(t){var e=t,r=0,n=0,o=0,i={read:function(){for(;o<8;){if(r>=e.length){if(0==o)return  -1;throw "unexpected end of file./"+o}var t=e.charAt(r);if(r+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6);}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw "c:"+t};return i},y=function(t,e,r){for(var n=function(t,e){var r=t,n=e,o=new Array(t*e),i={setPixel:function(t,e,n){o[e*r+t]=n;},write:function(t){t.writeString("GIF87a"),t.writeShort(r),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(r),t.writeShort(n),t.writeByte(0);var e=a(2);t.writeByte(2);for(var o=0;e.length-o>255;)t.writeByte(255),t.writeBytes(e,o,255),o+=255;t.writeByte(e.length-o),t.writeBytes(e,o,e.length-o),t.writeByte(0),t.writeString(";");}},a=function(t){for(var e=1<<t,r=1+(1<<t),n=t+1,i=s(),a=0;a<e;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(e)),i.add(String.fromCharCode(r));var u,h,c,l=v(),d=(u=l,h=0,c=0,{write:function(t,e){if(t>>>e!=0)throw "length over";for(;h+e>=8;)u.writeByte(255&(t<<h|c)),e-=8-h,t>>>=8-h,c=0,h=0;c|=t<<h,h+=e;},flush:function(){h>0&&u.writeByte(c);}});d.write(e,n);var f=0,g=String.fromCharCode(o[f]);for(f+=1;f<o.length;){var p=String.fromCharCode(o[f]);f+=1,i.contains(g+p)?g+=p:(d.write(i.indexOf(g),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(g+p)),g=p);}return d.write(i.indexOf(g),n),d.write(r,n),d.flush(),l.toByteArray()},s=function(){var t={},e=0,r={add:function(n){if(r.contains(n))throw "dup key:"+n;t[n]=e,e+=1;},size:function(){return e},indexOf:function(e){return t[e]},contains:function(e){return void 0!==t[e]}};return r};return i}(t,e),o=0;o<e;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,r(i,o));var a=v();n.write(a);for(var s=function(){var t=0,e=0,r=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t));},a=function(t){if(t<0);else {if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw "n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,e+=8,r+=1;e>=6;)i(t>>>e-6),e-=6;},o.flush=function(){if(e>0&&(i(t<<6-e),t=0,e=0),r%3!=0)for(var o=3-r%3,a=0;a<o;a+=1)n+="=";},o.toString=function(){return n},o}(),u=a.toByteArray(),h=0;h<u.length;h+=1)s.writeByte(u[h]);return s.flush(),"data:image/gif;base64,"+s};return t}();o.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var e=[],r=0;r<t.length;r++){var n=t.charCodeAt(r);n<128?e.push(n):n<2048?e.push(192|n>>6,128|63&n):n<55296||n>=57344?e.push(224|n>>12,128|n>>6&63,128|63&n):(r++,n=65536+((1023&n)<<10|1023&t.charCodeAt(r)),e.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n));}return e}(t)},void 0===(n="function"==typeof(r=function(){return o})?r.apply(e,[]):r)||(t.exports=n);},676:(t,e,r)=>{r.d(e,{default:()=>q});var n=function(){return (n=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var o in e=arguments[r])Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o]);return t}).apply(this,arguments)},o=function(){for(var t=0,e=0,r=arguments.length;e<r;e++)t+=arguments[e].length;var n=Array(t),o=0;for(e=0;e<r;e++)for(var i=arguments[e],a=0,s=i.length;a<s;a++,o++)n[o]=i[a];return n},i=function(t){return !!t&&"object"==typeof t&&!Array.isArray(t)};function a(t){for(var e=[],r=1;r<arguments.length;r++)e[r-1]=arguments[r];if(!e.length)return t;var s=e.shift();return void 0!==s&&i(t)&&i(s)?(t=n({},t),Object.keys(s).forEach((function(e){var r=t[e],n=s[e];Array.isArray(r)&&Array.isArray(n)?t[e]=n:i(r)&&i(n)?t[e]=a(Object.assign({},r),n):t[e]=n;})),a.apply(void 0,o([t],e))):t}function s(t,e){var r=document.createElement("a");r.download=e,r.href=t,document.body.appendChild(r),r.click(),document.body.removeChild(r);}function u(t){return e=this,r=void 0,o=function(){return function(t,e){var r,n,o,i,a={label:0,sent:function(){if(1&o[0])throw o[1];return o[1]},trys:[],ops:[]};return i={next:s(0),throw:s(1),return:s(2)},"function"==typeof Symbol&&(i[Symbol.iterator]=function(){return this}),i;function s(i){return function(s){return function(i){if(r)throw new TypeError("Generator is already executing.");for(;a;)try{if(r=1,n&&(o=2&i[0]?n.return:i[0]?n.throw||((o=n.return)&&o.call(n),0):n.next)&&!(o=o.call(n,i[1])).done)return o;switch(n=0,o&&(i=[2&i[0],o.value]),i[0]){case 0:case 1:o=i;break;case 4:return a.label++,{value:i[1],done:!1};case 5:a.label++,n=i[1],i=[0];continue;case 7:i=a.ops.pop(),a.trys.pop();continue;default:if(!((o=(o=a.trys).length>0&&o[o.length-1])||6!==i[0]&&2!==i[0])){a=0;continue}if(3===i[0]&&(!o||i[1]>o[0]&&i[1]<o[3])){a.label=i[1];break}if(6===i[0]&&a.label<o[1]){a.label=o[1],o=i;break}if(o&&a.label<o[2]){a.label=o[2],a.ops.push(i);break}o[2]&&a.ops.pop(),a.trys.pop();continue}i=e.call(t,a);}catch(t){i=[6,t],n=0;}finally{r=o=0;}if(5&i[0])throw i[1];return {value:i[0]?i[1]:void 0,done:true}}([i,s])}}}(this,(function(e){return [2,new Promise((function(e){var r=new XMLHttpRequest;r.onload=function(){var t=new FileReader;t.onloadend=function(){e(t.result);},t.readAsDataURL(r.response);},r.open("GET",t),r.responseType="blob",r.send();}))]}))},new((n=void 0)||(n=Promise))((function(t,i){function a(t){try{u(o.next(t));}catch(t){i(t);}}function s(t){try{u(o.throw(t));}catch(t){i(t);}}function u(e){var r;e.done?t(e.value):(r=e.value,r instanceof n?r:new n((function(t){t(r);}))).then(a,s);}u((o=o.apply(e,r||[])).next());}));var e,r,n,o;}const h={L:.07,M:.15,Q:.25,H:.3};var c=function(){return (c=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var o in e=arguments[r])Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o]);return t}).apply(this,arguments)};const l=function(){function t(t){var e=t.svg,r=t.type;this._svg=e,this._type=r;}return t.prototype.draw=function(t,e,r,n){var o;switch(this._type){case "dots":o=this._drawDot;break;case "classy":o=this._drawClassy;break;case "classy-rounded":o=this._drawClassyRounded;break;case "rounded":o=this._drawRounded;break;case "extra-rounded":o=this._drawExtraRounded;break;case "square":default:o=this._drawSquare;}o.call(this,{x:t,y:e,size:r,getNeighbor:n});},t.prototype._rotateFigure=function(t){var e,r=t.x,n=t.y,o=t.size,i=t.rotation,a=void 0===i?0:i,s=r+o/2,u=n+o/2;(0, t.draw)(),null===(e=this._element)||void 0===e||e.setAttribute("transform","rotate("+180*a/Math.PI+","+s+","+u+")");},t.prototype._basicDot=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","circle"),e._element.setAttribute("cx",String(n+r/2)),e._element.setAttribute("cy",String(o+r/2)),e._element.setAttribute("r",String(r/2));}}));},t.prototype._basicSquare=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","rect"),e._element.setAttribute("x",String(n)),e._element.setAttribute("y",String(o)),e._element.setAttribute("width",String(r)),e._element.setAttribute("height",String(r));}}));},t.prototype._basicSideRounded=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("d","M "+n+" "+o+"v "+r+"h "+r/2+"a "+r/2+" "+r/2+", 0, 0, 0, 0 "+-r);}}));},t.prototype._basicCornerRounded=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("d","M "+n+" "+o+"v "+r+"h "+r+"v "+-r/2+"a "+r/2+" "+r/2+", 0, 0, 0, "+-r/2+" "+-r/2);}}));},t.prototype._basicCornerExtraRounded=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("d","M "+n+" "+o+"v "+r+"h "+r+"a "+r+" "+r+", 0, 0, 0, "+-r+" "+-r);}}));},t.prototype._basicCornersRounded=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(c(c({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("d","M "+n+" "+o+"v "+r/2+"a "+r/2+" "+r/2+", 0, 0, 0, "+r/2+" "+r/2+"h "+r/2+"v "+-r/2+"a "+r/2+" "+r/2+", 0, 0, 0, "+-r/2+" "+-r/2);}}));},t.prototype._drawDot=function(t){var e=t.x,r=t.y,n=t.size;this._basicDot({x:e,y:r,size:n,rotation:0});},t.prototype._drawSquare=function(t){var e=t.x,r=t.y,n=t.size;this._basicSquare({x:e,y:r,size:n,rotation:0});},t.prototype._drawRounded=function(t){var e=t.x,r=t.y,n=t.size,o=t.getNeighbor,i=o?+o(-1,0):0,a=o?+o(1,0):0,s=o?+o(0,-1):0,u=o?+o(0,1):0,h=i+a+s+u;if(0!==h)if(h>2||i&&a||s&&u)this._basicSquare({x:e,y:r,size:n,rotation:0});else {if(2===h){var c=0;return i&&s?c=Math.PI/2:s&&a?c=Math.PI:a&&u&&(c=-Math.PI/2),void this._basicCornerRounded({x:e,y:r,size:n,rotation:c})}if(1===h)return c=0,s?c=Math.PI/2:a?c=Math.PI:u&&(c=-Math.PI/2),void this._basicSideRounded({x:e,y:r,size:n,rotation:c})}else this._basicDot({x:e,y:r,size:n,rotation:0});},t.prototype._drawExtraRounded=function(t){var e=t.x,r=t.y,n=t.size,o=t.getNeighbor,i=o?+o(-1,0):0,a=o?+o(1,0):0,s=o?+o(0,-1):0,u=o?+o(0,1):0,h=i+a+s+u;if(0!==h)if(h>2||i&&a||s&&u)this._basicSquare({x:e,y:r,size:n,rotation:0});else {if(2===h){var c=0;return i&&s?c=Math.PI/2:s&&a?c=Math.PI:a&&u&&(c=-Math.PI/2),void this._basicCornerExtraRounded({x:e,y:r,size:n,rotation:c})}if(1===h)return c=0,s?c=Math.PI/2:a?c=Math.PI:u&&(c=-Math.PI/2),void this._basicSideRounded({x:e,y:r,size:n,rotation:c})}else this._basicDot({x:e,y:r,size:n,rotation:0});},t.prototype._drawClassy=function(t){var e=t.x,r=t.y,n=t.size,o=t.getNeighbor,i=o?+o(-1,0):0,a=o?+o(1,0):0,s=o?+o(0,-1):0,u=o?+o(0,1):0;0!==i+a+s+u?i||s?a||u?this._basicSquare({x:e,y:r,size:n,rotation:0}):this._basicCornerRounded({x:e,y:r,size:n,rotation:Math.PI/2}):this._basicCornerRounded({x:e,y:r,size:n,rotation:-Math.PI/2}):this._basicCornersRounded({x:e,y:r,size:n,rotation:Math.PI/2});},t.prototype._drawClassyRounded=function(t){var e=t.x,r=t.y,n=t.size,o=t.getNeighbor,i=o?+o(-1,0):0,a=o?+o(1,0):0,s=o?+o(0,-1):0,u=o?+o(0,1):0;0!==i+a+s+u?i||s?a||u?this._basicSquare({x:e,y:r,size:n,rotation:0}):this._basicCornerExtraRounded({x:e,y:r,size:n,rotation:Math.PI/2}):this._basicCornerExtraRounded({x:e,y:r,size:n,rotation:-Math.PI/2}):this._basicCornersRounded({x:e,y:r,size:n,rotation:Math.PI/2});},t}();var d=function(){return (d=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var o in e=arguments[r])Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o]);return t}).apply(this,arguments)};const f=function(){function t(t){var e=t.svg,r=t.type;this._svg=e,this._type=r;}return t.prototype.draw=function(t,e,r,n){var o;switch(this._type){case "square":o=this._drawSquare;break;case "extra-rounded":o=this._drawExtraRounded;break;case "dot":default:o=this._drawDot;}o.call(this,{x:t,y:e,size:r,rotation:n});},t.prototype._rotateFigure=function(t){var e,r=t.x,n=t.y,o=t.size,i=t.rotation,a=void 0===i?0:i,s=r+o/2,u=n+o/2;(0, t.draw)(),null===(e=this._element)||void 0===e||e.setAttribute("transform","rotate("+180*a/Math.PI+","+s+","+u+")");},t.prototype._basicDot=function(t){var e=this,r=t.size,n=t.x,o=t.y,i=r/7;this._rotateFigure(d(d({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("clip-rule","evenodd"),e._element.setAttribute("d","M "+(n+r/2)+" "+o+"a "+r/2+" "+r/2+" 0 1 0 0.1 0zm 0 "+i+"a "+(r/2-i)+" "+(r/2-i)+" 0 1 1 -0.1 0Z");}}));},t.prototype._basicSquare=function(t){var e=this,r=t.size,n=t.x,o=t.y,i=r/7;this._rotateFigure(d(d({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("clip-rule","evenodd"),e._element.setAttribute("d","M "+n+" "+o+"v "+r+"h "+r+"v "+-r+"zM "+(n+i)+" "+(o+i)+"h "+(r-2*i)+"v "+(r-2*i)+"h "+(2*i-r)+"z");}}));},t.prototype._basicExtraRounded=function(t){var e=this,r=t.size,n=t.x,o=t.y,i=r/7;this._rotateFigure(d(d({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","path"),e._element.setAttribute("clip-rule","evenodd"),e._element.setAttribute("d","M "+n+" "+(o+2.5*i)+"v "+2*i+"a "+2.5*i+" "+2.5*i+", 0, 0, 0, "+2.5*i+" "+2.5*i+"h "+2*i+"a "+2.5*i+" "+2.5*i+", 0, 0, 0, "+2.5*i+" "+2.5*-i+"v "+-2*i+"a "+2.5*i+" "+2.5*i+", 0, 0, 0, "+2.5*-i+" "+2.5*-i+"h "+-2*i+"a "+2.5*i+" "+2.5*i+", 0, 0, 0, "+2.5*-i+" "+2.5*i+"M "+(n+2.5*i)+" "+(o+i)+"h "+2*i+"a "+1.5*i+" "+1.5*i+", 0, 0, 1, "+1.5*i+" "+1.5*i+"v "+2*i+"a "+1.5*i+" "+1.5*i+", 0, 0, 1, "+1.5*-i+" "+1.5*i+"h "+-2*i+"a "+1.5*i+" "+1.5*i+", 0, 0, 1, "+1.5*-i+" "+1.5*-i+"v "+-2*i+"a "+1.5*i+" "+1.5*i+", 0, 0, 1, "+1.5*i+" "+1.5*-i);}}));},t.prototype._drawDot=function(t){var e=t.x,r=t.y,n=t.size,o=t.rotation;this._basicDot({x:e,y:r,size:n,rotation:o});},t.prototype._drawSquare=function(t){var e=t.x,r=t.y,n=t.size,o=t.rotation;this._basicSquare({x:e,y:r,size:n,rotation:o});},t.prototype._drawExtraRounded=function(t){var e=t.x,r=t.y,n=t.size,o=t.rotation;this._basicExtraRounded({x:e,y:r,size:n,rotation:o});},t}();var g=function(){return (g=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var o in e=arguments[r])Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o]);return t}).apply(this,arguments)};const p=function(){function t(t){var e=t.svg,r=t.type;this._svg=e,this._type=r;}return t.prototype.draw=function(t,e,r,n){var o;switch(this._type){case "square":o=this._drawSquare;break;case "dot":default:o=this._drawDot;}o.call(this,{x:t,y:e,size:r,rotation:n});},t.prototype._rotateFigure=function(t){var e,r=t.x,n=t.y,o=t.size,i=t.rotation,a=void 0===i?0:i,s=r+o/2,u=n+o/2;(0, t.draw)(),null===(e=this._element)||void 0===e||e.setAttribute("transform","rotate("+180*a/Math.PI+","+s+","+u+")");},t.prototype._basicDot=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(g(g({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","circle"),e._element.setAttribute("cx",String(n+r/2)),e._element.setAttribute("cy",String(o+r/2)),e._element.setAttribute("r",String(r/2));}}));},t.prototype._basicSquare=function(t){var e=this,r=t.size,n=t.x,o=t.y;this._rotateFigure(g(g({},t),{draw:function(){e._element=document.createElementNS("http://www.w3.org/2000/svg","rect"),e._element.setAttribute("x",String(n)),e._element.setAttribute("y",String(o)),e._element.setAttribute("width",String(r)),e._element.setAttribute("height",String(r));}}));},t.prototype._drawDot=function(t){var e=t.x,r=t.y,n=t.size,o=t.rotation;this._basicDot({x:e,y:r,size:n,rotation:o});},t.prototype._drawSquare=function(t){var e=t.x,r=t.y,n=t.size,o=t.rotation;this._basicSquare({x:e,y:r,size:n,rotation:o});},t}(),v="circle";var w=function(t,e,r,n){return new(r||(r=Promise))((function(o,i){function a(t){try{u(n.next(t));}catch(t){i(t);}}function s(t){try{u(n.throw(t));}catch(t){i(t);}}function u(t){var e;t.done?o(t.value):(e=t.value,e instanceof r?e:new r((function(t){t(e);}))).then(a,s);}u((n=n.apply(t,[])).next());}))},y=function(t,e){var r,n,o,i,a={label:0,sent:function(){if(1&o[0])throw o[1];return o[1]},trys:[],ops:[]};return i={next:s(0),throw:s(1),return:s(2)},"function"==typeof Symbol&&(i[Symbol.iterator]=function(){return this}),i;function s(i){return function(s){return function(i){if(r)throw new TypeError("Generator is already executing.");for(;a;)try{if(r=1,n&&(o=2&i[0]?n.return:i[0]?n.throw||((o=n.return)&&o.call(n),0):n.next)&&!(o=o.call(n,i[1])).done)return o;switch(n=0,o&&(i=[2&i[0],o.value]),i[0]){case 0:case 1:o=i;break;case 4:return a.label++,{value:i[1],done:!1};case 5:a.label++,n=i[1],i=[0];continue;case 7:i=a.ops.pop(),a.trys.pop();continue;default:if(!((o=(o=a.trys).length>0&&o[o.length-1])||6!==i[0]&&2!==i[0])){a=0;continue}if(3===i[0]&&(!o||i[1]>o[0]&&i[1]<o[3])){a.label=i[1];break}if(6===i[0]&&a.label<o[1]){a.label=o[1],o=i;break}if(o&&a.label<o[2]){a.label=o[2],a.ops.push(i);break}o[2]&&a.ops.pop(),a.trys.pop();continue}i=e.call(t,a);}catch(t){i=[6,t],n=0;}finally{r=o=0;}if(5&i[0])throw i[1];return {value:i[0]?i[1]:void 0,done:true}}([i,s])}}},m=[[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]],b=[[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,1,1,1,0,0],[0,0,1,1,1,0,0],[0,0,1,1,1,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0]];const _=function(){function t(t){this._element=document.createElementNS("http://www.w3.org/2000/svg","svg"),this._element.setAttribute("width",String(t.width)),this._element.setAttribute("height",String(t.height)),this._defs=document.createElementNS("http://www.w3.org/2000/svg","defs"),this._element.appendChild(this._defs),this._options=t;}return Object.defineProperty(t.prototype,"width",{get:function(){return this._options.width},enumerable:false,configurable:true}),Object.defineProperty(t.prototype,"height",{get:function(){return this._options.height},enumerable:false,configurable:true}),t.prototype.getElement=function(){return this._element},t.prototype.drawQR=function(t){return w(this,void 0,void 0,(function(){var e,r,n,o,i,a,s,u,c,l,d=this;return y(this,(function(f){switch(f.label){case 0:return e=t.getModuleCount(),r=Math.min(this._options.width,this._options.height)-2*this._options.margin,n=this._options.shape===v?r/Math.sqrt(2):r,o=Math.floor(n/e),i={hideXDots:0,hideYDots:0,width:0,height:0},this._qr=t,this._options.image?[4,this.loadImage()]:[3,2];case 1:if(f.sent(),!this._image)return [2];a=this._options,s=a.imageOptions,u=a.qrOptions,c=s.imageSize*h[u.errorCorrectionLevel],l=Math.floor(c*e*e),i=function(t){var e=t.originalHeight,r=t.originalWidth,n=t.maxHiddenDots,o=t.maxHiddenAxisDots,i=t.dotSize,a={x:0,y:0},s={x:0,y:0};if(e<=0||r<=0||n<=0||i<=0)return {height:0,width:0,hideYDots:0,hideXDots:0};var u=e/r;return a.x=Math.floor(Math.sqrt(n/u)),a.x<=0&&(a.x=1),o&&o<a.x&&(a.x=o),a.x%2==0&&a.x--,s.x=a.x*i,a.y=1+2*Math.ceil((a.x*u-1)/2),s.y=Math.round(s.x*u),(a.y*a.x>n||o&&o<a.y)&&(o&&o<a.y?(a.y=o,a.y%2==0&&a.x--):a.y-=2,s.y=a.y*i,a.x=1+2*Math.ceil((a.y/u-1)/2),s.x=Math.round(s.y/u)),{height:s.y,width:s.x,hideYDots:a.y,hideXDots:a.x}}({originalWidth:this._image.width,originalHeight:this._image.height,maxHiddenDots:l,maxHiddenAxisDots:e-14,dotSize:o}),f.label=2;case 2:return this.drawBackground(),this.drawDots((function(t,r){var n,o,a,s,u,h;return !(d._options.imageOptions.hideBackgroundDots&&t>=(e-i.hideXDots)/2&&t<(e+i.hideXDots)/2&&r>=(e-i.hideYDots)/2&&r<(e+i.hideYDots)/2||(null===(n=m[t])||void 0===n?void 0:n[r])||(null===(o=m[t-e+7])||void 0===o?void 0:o[r])||(null===(a=m[t])||void 0===a?void 0:a[r-e+7])||(null===(s=b[t])||void 0===s?void 0:s[r])||(null===(u=b[t-e+7])||void 0===u?void 0:u[r])||(null===(h=b[t])||void 0===h?void 0:h[r-e+7]))})),this.drawCorners(),this._options.image?[4,this.drawImage({width:i.width,height:i.height,count:e,dotSize:o})]:[3,4];case 3:f.sent(),f.label=4;case 4:return [2]}}))}))},t.prototype.drawBackground=function(){var t,e,r,n=this._element,o=this._options;if(n){var i=null===(t=o.backgroundOptions)||void 0===t?void 0:t.gradient,a=null===(e=o.backgroundOptions)||void 0===e?void 0:e.color;if((i||a)&&this._createColor({options:i,color:a,additionalRotation:0,x:0,y:0,height:o.height,width:o.width,name:"background-color"}),null===(r=o.backgroundOptions)||void 0===r?void 0:r.round){var s=Math.min(o.width,o.height),u=document.createElementNS("http://www.w3.org/2000/svg","rect");this._backgroundClipPath=document.createElementNS("http://www.w3.org/2000/svg","clipPath"),this._backgroundClipPath.setAttribute("id","clip-path-background-color"),this._defs.appendChild(this._backgroundClipPath),u.setAttribute("x",String((o.width-s)/2)),u.setAttribute("y",String((o.height-s)/2)),u.setAttribute("width",String(s)),u.setAttribute("height",String(s)),u.setAttribute("rx",String(s/2*o.backgroundOptions.round)),this._backgroundClipPath.appendChild(u);}}},t.prototype.drawDots=function(t){var e,r,n=this;if(!this._qr)throw "QR code is not defined";var o=this._options,i=this._qr.getModuleCount();if(i>o.width||i>o.height)throw "The canvas is too small.";var a=Math.min(o.width,o.height)-2*o.margin,s=o.shape===v?a/Math.sqrt(2):a,u=Math.floor(s/i),h=Math.floor((o.width-i*u)/2),c=Math.floor((o.height-i*u)/2),d=new l({svg:this._element,type:o.dotsOptions.type});this._dotsClipPath=document.createElementNS("http://www.w3.org/2000/svg","clipPath"),this._dotsClipPath.setAttribute("id","clip-path-dot-color"),this._defs.appendChild(this._dotsClipPath),this._createColor({options:null===(e=o.dotsOptions)||void 0===e?void 0:e.gradient,color:o.dotsOptions.color,additionalRotation:0,x:0,y:0,height:o.height,width:o.width,name:"dot-color"});for(var f=function(e){for(var o=function(o){return t&&!t(e,o)?"continue":(null===(r=g._qr)||void 0===r?void 0:r.isDark(e,o))?(d.draw(h+e*u,c+o*u,u,(function(r,a){return !(e+r<0||o+a<0||e+r>=i||o+a>=i)&&!(t&&!t(e+r,o+a))&&!!n._qr&&n._qr.isDark(e+r,o+a)})),void(d._element&&g._dotsClipPath&&g._dotsClipPath.appendChild(d._element))):"continue"},a=0;a<i;a++)o(a);},g=this,p=0;p<i;p++)f(p);if(o.shape===v){var w=Math.floor((a/u-i)/2),y=i+2*w,m=h-w*u,b=c-w*u,_=[],x=Math.floor(y/2);for(p=0;p<y;p++){_[p]=[];for(var S=0;S<y;S++)p>=w-1&&p<=y-w&&S>=w-1&&S<=y-w||Math.sqrt((p-x)*(p-x)+(S-x)*(S-x))>x?_[p][S]=0:_[p][S]=this._qr.isDark(S-2*w<0?S:S>=i?S-2*w:S-w,p-2*w<0?p:p>=i?p-2*w:p-w)?1:0;}var M=function(t){for(var e=function(e){if(!_[t][e])return "continue";d.draw(m+t*u,b+e*u,u,(function(r,n){var o;return !!(null===(o=_[t+r])||void 0===o?void 0:o[e+n])})),d._element&&C._dotsClipPath&&C._dotsClipPath.appendChild(d._element);},r=0;r<y;r++)e(r);},C=this;for(p=0;p<y;p++)M(p);}},t.prototype.drawCorners=function(){var t=this;if(!this._qr)throw "QR code is not defined";var e=this._element,r=this._options;if(!e)throw "Element code is not defined";var n=this._qr.getModuleCount(),o=Math.min(r.width,r.height)-2*r.margin,i=r.shape===v?o/Math.sqrt(2):o,a=Math.floor(i/n),s=7*a,u=3*a,h=Math.floor((r.width-n*a)/2),c=Math.floor((r.height-n*a)/2);[[0,0,0],[1,0,Math.PI/2],[0,1,-Math.PI/2]].forEach((function(e){var o,i,d,g,v,w,y,_,x,S,M,C,A=e[0],k=e[1],O=e[2],D=h+A*a*(n-7),P=c+k*a*(n-7),z=t._dotsClipPath,B=t._dotsClipPath;if(((null===(o=r.cornersSquareOptions)||void 0===o?void 0:o.gradient)||(null===(i=r.cornersSquareOptions)||void 0===i?void 0:i.color))&&((z=document.createElementNS("http://www.w3.org/2000/svg","clipPath")).setAttribute("id","clip-path-corners-square-color-"+A+"-"+k),t._defs.appendChild(z),t._cornersSquareClipPath=t._cornersDotClipPath=B=z,t._createColor({options:null===(d=r.cornersSquareOptions)||void 0===d?void 0:d.gradient,color:null===(g=r.cornersSquareOptions)||void 0===g?void 0:g.color,additionalRotation:O,x:D,y:P,height:s,width:s,name:"corners-square-color-"+A+"-"+k})),null===(v=r.cornersSquareOptions)||void 0===v?void 0:v.type){var q=new f({svg:t._element,type:r.cornersSquareOptions.type});q.draw(D,P,s,O),q._element&&z&&z.appendChild(q._element);}else for(var I=new l({svg:t._element,type:r.dotsOptions.type}),E=function(t){for(var e=function(e){if(!(null===(w=m[t])||void 0===w?void 0:w[e]))return "continue";I.draw(D+t*a,P+e*a,a,(function(r,n){var o;return !!(null===(o=m[t+r])||void 0===o?void 0:o[e+n])})),I._element&&z&&z.appendChild(I._element);},r=0;r<m[t].length;r++)e(r);},L=0;L<m.length;L++)E(L);if(((null===(y=r.cornersDotOptions)||void 0===y?void 0:y.gradient)||(null===(_=r.cornersDotOptions)||void 0===_?void 0:_.color))&&((B=document.createElementNS("http://www.w3.org/2000/svg","clipPath")).setAttribute("id","clip-path-corners-dot-color-"+A+"-"+k),t._defs.appendChild(B),t._cornersDotClipPath=B,t._createColor({options:null===(x=r.cornersDotOptions)||void 0===x?void 0:x.gradient,color:null===(S=r.cornersDotOptions)||void 0===S?void 0:S.color,additionalRotation:O,x:D+2*a,y:P+2*a,height:u,width:u,name:"corners-dot-color-"+A+"-"+k})),null===(M=r.cornersDotOptions)||void 0===M?void 0:M.type){var R=new p({svg:t._element,type:r.cornersDotOptions.type});R.draw(D+2*a,P+2*a,u,O),R._element&&B&&B.appendChild(R._element);}else {I=new l({svg:t._element,type:r.dotsOptions.type});var N=function(t){for(var e=function(e){if(!(null===(C=b[t])||void 0===C?void 0:C[e]))return "continue";I.draw(D+t*a,P+e*a,a,(function(r,n){var o;return !!(null===(o=b[t+r])||void 0===o?void 0:o[e+n])})),I._element&&B&&B.appendChild(I._element);},r=0;r<b[t].length;r++)e(r);};for(L=0;L<b.length;L++)N(L);}}));},t.prototype.loadImage=function(){var t=this;return new Promise((function(e,r){var n=t._options,o=new Image;if(!n.image)return r("Image is not defined");"string"==typeof n.imageOptions.crossOrigin&&(o.crossOrigin=n.imageOptions.crossOrigin),t._image=o,o.onload=function(){e();},o.src=n.image;}))},t.prototype.drawImage=function(t){var e=t.width,r=t.height,n=t.count,o=t.dotSize;return w(this,void 0,void 0,(function(){var t,i,a,s,h,c,l,d,f;return y(this,(function(g){switch(g.label){case 0:return t=this._options,i=Math.floor((t.width-n*o)/2),a=Math.floor((t.height-n*o)/2),s=i+t.imageOptions.margin+(n*o-e)/2,h=a+t.imageOptions.margin+(n*o-r)/2,c=e-2*t.imageOptions.margin,l=r-2*t.imageOptions.margin,(d=document.createElementNS("http://www.w3.org/2000/svg","image")).setAttribute("x",String(s)),d.setAttribute("y",String(h)),d.setAttribute("width",c+"px"),d.setAttribute("height",l+"px"),[4,u(t.image||"")];case 1:return f=g.sent(),d.setAttribute("href",f||""),this._element.appendChild(d),[2]}}))}))},t.prototype._createColor=function(t){var e=t.options,r=t.color,n=t.additionalRotation,o=t.x,i=t.y,a=t.height,s=t.width,u=t.name,h=s>a?s:a,c=document.createElementNS("http://www.w3.org/2000/svg","rect");if(c.setAttribute("x",String(o)),c.setAttribute("y",String(i)),c.setAttribute("height",String(a)),c.setAttribute("width",String(s)),c.setAttribute("clip-path","url('#clip-path-"+u+"')"),e){var l;if("radial"===e.type)(l=document.createElementNS("http://www.w3.org/2000/svg","radialGradient")).setAttribute("id",u),l.setAttribute("gradientUnits","userSpaceOnUse"),l.setAttribute("fx",String(o+s/2)),l.setAttribute("fy",String(i+a/2)),l.setAttribute("cx",String(o+s/2)),l.setAttribute("cy",String(i+a/2)),l.setAttribute("r",String(h/2));else {var d=((e.rotation||0)+n)%(2*Math.PI),f=(d+2*Math.PI)%(2*Math.PI),g=o+s/2,p=i+a/2,v=o+s/2,w=i+a/2;f>=0&&f<=.25*Math.PI||f>1.75*Math.PI&&f<=2*Math.PI?(g-=s/2,p-=a/2*Math.tan(d),v+=s/2,w+=a/2*Math.tan(d)):f>.25*Math.PI&&f<=.75*Math.PI?(p-=a/2,g-=s/2/Math.tan(d),w+=a/2,v+=s/2/Math.tan(d)):f>.75*Math.PI&&f<=1.25*Math.PI?(g+=s/2,p+=a/2*Math.tan(d),v-=s/2,w-=a/2*Math.tan(d)):f>1.25*Math.PI&&f<=1.75*Math.PI&&(p+=a/2,g+=s/2/Math.tan(d),w-=a/2,v-=s/2/Math.tan(d)),(l=document.createElementNS("http://www.w3.org/2000/svg","linearGradient")).setAttribute("id",u),l.setAttribute("gradientUnits","userSpaceOnUse"),l.setAttribute("x1",String(Math.round(g))),l.setAttribute("y1",String(Math.round(p))),l.setAttribute("x2",String(Math.round(v))),l.setAttribute("y2",String(Math.round(w)));}e.colorStops.forEach((function(t){var e=t.offset,r=t.color,n=document.createElementNS("http://www.w3.org/2000/svg","stop");n.setAttribute("offset",100*e+"%"),n.setAttribute("stop-color",r),l.appendChild(n);})),c.setAttribute("fill","url('#"+u+"')"),this._defs.appendChild(l);}else r&&c.setAttribute("fill",r);this._element.appendChild(c);},t}(),x="canvas";for(var S={},M=0;M<=40;M++)S[M]=M;const C={type:x,shape:"square",width:300,height:300,data:"",margin:0,qrOptions:{typeNumber:S[0],mode:void 0,errorCorrectionLevel:"Q"},imageOptions:{hideBackgroundDots:true,imageSize:.4,crossOrigin:void 0,margin:0},dotsOptions:{type:"square",color:"#000"},backgroundOptions:{round:0,color:"#fff"}};var A=function(){return (A=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var o in e=arguments[r])Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o]);return t}).apply(this,arguments)};function k(t){var e=A({},t);if(!e.colorStops||!e.colorStops.length)throw "Field 'colorStops' is required in gradient";return e.rotation?e.rotation=Number(e.rotation):e.rotation=0,e.colorStops=e.colorStops.map((function(t){return A(A({},t),{offset:Number(t.offset)})})),e}function O(t){var e=A({},t);return e.width=Number(e.width),e.height=Number(e.height),e.margin=Number(e.margin),e.imageOptions=A(A({},e.imageOptions),{hideBackgroundDots:Boolean(e.imageOptions.hideBackgroundDots),imageSize:Number(e.imageOptions.imageSize),margin:Number(e.imageOptions.margin)}),e.margin>Math.min(e.width,e.height)&&(e.margin=Math.min(e.width,e.height)),e.dotsOptions=A({},e.dotsOptions),e.dotsOptions.gradient&&(e.dotsOptions.gradient=k(e.dotsOptions.gradient)),e.cornersSquareOptions&&(e.cornersSquareOptions=A({},e.cornersSquareOptions),e.cornersSquareOptions.gradient&&(e.cornersSquareOptions.gradient=k(e.cornersSquareOptions.gradient))),e.cornersDotOptions&&(e.cornersDotOptions=A({},e.cornersDotOptions),e.cornersDotOptions.gradient&&(e.cornersDotOptions.gradient=k(e.cornersDotOptions.gradient))),e.backgroundOptions&&(e.backgroundOptions=A({},e.backgroundOptions),e.backgroundOptions.gradient&&(e.backgroundOptions.gradient=k(e.backgroundOptions.gradient))),e}var D=r(192),P=r.n(D),z=function(t,e,r,n){return new(r||(r=Promise))((function(o,i){function a(t){try{u(n.next(t));}catch(t){i(t);}}function s(t){try{u(n.throw(t));}catch(t){i(t);}}function u(t){var e;t.done?o(t.value):(e=t.value,e instanceof r?e:new r((function(t){t(e);}))).then(a,s);}u((n=n.apply(t,[])).next());}))},B=function(t,e){var r,n,o,i,a={label:0,sent:function(){if(1&o[0])throw o[1];return o[1]},trys:[],ops:[]};return i={next:s(0),throw:s(1),return:s(2)},"function"==typeof Symbol&&(i[Symbol.iterator]=function(){return this}),i;function s(i){return function(s){return function(i){if(r)throw new TypeError("Generator is already executing.");for(;a;)try{if(r=1,n&&(o=2&i[0]?n.return:i[0]?n.throw||((o=n.return)&&o.call(n),0):n.next)&&!(o=o.call(n,i[1])).done)return o;switch(n=0,o&&(i=[2&i[0],o.value]),i[0]){case 0:case 1:o=i;break;case 4:return a.label++,{value:i[1],done:!1};case 5:a.label++,n=i[1],i=[0];continue;case 7:i=a.ops.pop(),a.trys.pop();continue;default:if(!((o=(o=a.trys).length>0&&o[o.length-1])||6!==i[0]&&2!==i[0])){a=0;continue}if(3===i[0]&&(!o||i[1]>o[0]&&i[1]<o[3])){a.label=i[1];break}if(6===i[0]&&a.label<o[1]){a.label=o[1],o=i;break}if(o&&a.label<o[2]){a.label=o[2],a.ops.push(i);break}o[2]&&a.ops.pop(),a.trys.pop();continue}i=e.call(t,a);}catch(t){i=[6,t],n=0;}finally{r=o=0;}if(5&i[0])throw i[1];return {value:i[0]?i[1]:void 0,done:true}}([i,s])}}};const q=function(){function t(t){this._options=t?O(a(C,t)):C,this.update();}return t._clearContainer=function(t){t&&(t.innerHTML="");},t.prototype._setupSvg=function(){var t=this;if(this._qr){var e=new _(this._options);this._svg=e.getElement(),this._svgDrawingPromise=e.drawQR(this._qr).then((function(){var r;t._svg&&(null===(r=t._extension)||void 0===r||r.call(t,e.getElement(),t._options));}));}},t.prototype._setupCanvas=function(){var t,e=this;this._qr&&(this._canvas=document.createElement("canvas"),this._canvas.width=this._options.width,this._canvas.height=this._options.height,this._setupSvg(),this._canvasDrawingPromise=null===(t=this._svgDrawingPromise)||void 0===t?void 0:t.then((function(){if(e._svg){var t=e._svg,r=(new XMLSerializer).serializeToString(t),n="data:image/svg+xml;base64,"+btoa(r),o=new Image;return new Promise((function(t){o.onload=function(){var r,n;null===(n=null===(r=e._canvas)||void 0===r?void 0:r.getContext("2d"))||void 0===n||n.drawImage(o,0,0),t();},o.src=n;}))}})));},t.prototype._getElement=function(t){return void 0===t&&(t="png"),z(this,void 0,void 0,(function(){return B(this,(function(e){switch(e.label){case 0:if(!this._qr)throw "QR code is empty";return "svg"!==t.toLowerCase()?[3,2]:(this._svg&&this._svgDrawingPromise||this._setupSvg(),[4,this._svgDrawingPromise]);case 1:return e.sent(),[2,this._svg];case 2:return this._canvas&&this._canvasDrawingPromise||this._setupCanvas(),[4,this._canvasDrawingPromise];case 3:return e.sent(),[2,this._canvas]}}))}))},t.prototype.update=function(e){t._clearContainer(this._container),this._options=e?O(a(this._options,e)):this._options,this._options.data&&(this._qr=P()(this._options.qrOptions.typeNumber,this._options.qrOptions.errorCorrectionLevel),this._qr.addData(this._options.data,this._options.qrOptions.mode||function(t){switch(true){case /^[0-9]*$/.test(t):return "Numeric";case /^[0-9A-Z $%*+\-./:]*$/.test(t):return "Alphanumeric";default:return "Byte"}}(this._options.data)),this._qr.make(),this._options.type===x?this._setupCanvas():this._setupSvg(),this.append(this._container));},t.prototype.append=function(t){if(t){if("function"!=typeof t.appendChild)throw "Container should be a single DOM node";this._options.type===x?this._canvas&&t.appendChild(this._canvas):this._svg&&t.appendChild(this._svg),this._container=t;}},t.prototype.applyExtension=function(t){if(!t)throw "Extension function should be defined.";this._extension=t,this.update();},t.prototype.deleteExtension=function(){this._extension=void 0,this.update();},t.prototype.getRawData=function(t){return void 0===t&&(t="png"),z(this,void 0,void 0,(function(){var e,r,n;return B(this,(function(o){switch(o.label){case 0:if(!this._qr)throw "QR code is empty";return [4,this._getElement(t)];case 1:return (e=o.sent())?"svg"===t.toLowerCase()?(r=new XMLSerializer,n=r.serializeToString(e),[2,new Blob(['<?xml version="1.0" standalone="no"?>\r\n'+n],{type:"image/svg+xml"})]):[2,new Promise((function(r){return e.toBlob(r,"image/"+t,1)}))]:[2,null]}}))}))},t.prototype.download=function(t){return z(this,void 0,void 0,(function(){var e,r,n,o,i;return B(this,(function(a){switch(a.label){case 0:if(!this._qr)throw "QR code is empty";return e="png",r="qr","string"==typeof t?(e=t,console.warn("Extension is deprecated as argument for 'download' method, please pass object { name: '...', extension: '...' } as argument")):"object"==typeof t&&null!==t&&(t.name&&(r=t.name),t.extension&&(e=t.extension)),[4,this._getElement(e)];case 1:return (n=a.sent())?("svg"===e.toLowerCase()?(o=new XMLSerializer,i='<?xml version="1.0" standalone="no"?>\r\n'+(i=o.serializeToString(n)),s("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(i),r+".svg")):s(n.toDataURL("image/"+e),r+"."+e),[2]):[2]}}))}))},t}();}},e={};function r(n){if(e[n])return e[n].exports;var o=e[n]={exports:{}};return t[n](o,o.exports,r),o.exports}return r.n=t=>{var e=t&&t.__esModule?()=>t.default:()=>t;return r.d(e,{a:e}),e},r.d=(t,e)=>{for(var n in e)r.o(e,n)&&!r.o(t,n)&&Object.defineProperty(t,n,{enumerable:true,get:e[n]});},r.o=(t,e)=>Object.prototype.hasOwnProperty.call(t,e),r(676)})().default}));
		
	} (qrCodeStyling));
	return qrCodeStyling.exports;
}

var qrCodeStylingExports = requireQrCodeStyling();
const s = /*@__PURE__*/getDefaultExportFromCjs(qrCodeStylingExports);

var lottieWebLight = {exports: {}};

var hasRequiredLottieWebLight;

function requireLottieWebLight () {
	if (hasRequiredLottieWebLight) return lottieWebLight.exports;
	hasRequiredLottieWebLight = 1;
	(function (module) {
		(typeof navigator !== "undefined") && (function(root, factory) {
		    if (module.exports) {
		        module.exports = factory(root);
		    } else {
		        root.lottie = factory(root);
		        root.bodymovin = root.lottie;
		    }
		}((window || {}), function(window) {

		/* exported svgNS, locationHref, initialDefaultFrame, _useWebWorker */

		var svgNS = 'http://www.w3.org/2000/svg';

		var locationHref = '';

		var initialDefaultFrame = -999999;

		var _useWebWorker = false;

		/* global createSizedArray */
		/* exported subframeEnabled, expressionsPlugin, isSafari, cachedColors, bmPow, bmSqrt, bmFloor, bmMax, bmMin, ProjectInterface,
		defaultCurveSegments, degToRads, roundCorner, bmRnd, styleDiv, BMEnterFrameEvent, BMCompleteEvent, BMCompleteLoopEvent,
		BMSegmentStartEvent, BMDestroyEvent, BMRenderFrameErrorEvent, BMConfigErrorEvent, BMAnimationConfigErrorEvent, createElementID,
		addSaturationToRGB, addBrightnessToRGB, addHueToRGB, rgbToHex */

		var subframeEnabled = true;
		var idPrefix = '';
		var expressionsPlugin;
		var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
		var bmPow = Math.pow;
		var bmSqrt = Math.sqrt;
		var bmFloor = Math.floor;
		var bmMin = Math.min;

		var BMMath = {};
		(function () {
		  var propertyNames = ['abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'ceil', 'cbrt', 'expm1', 'clz32', 'cos', 'cosh', 'exp', 'floor', 'fround', 'hypot', 'imul', 'log', 'log1p', 'log2', 'log10', 'max', 'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2'];
		  var i;
		  var len = propertyNames.length;
		  for (i = 0; i < len; i += 1) {
		    BMMath[propertyNames[i]] = Math[propertyNames[i]];
		  }
		}());

		function ProjectInterface() { return {}; }

		BMMath.random = Math.random;
		BMMath.abs = function (val) {
		  var tOfVal = typeof val;
		  if (tOfVal === 'object' && val.length) {
		    var absArr = createSizedArray(val.length);
		    var i;
		    var len = val.length;
		    for (i = 0; i < len; i += 1) {
		      absArr[i] = Math.abs(val[i]);
		    }
		    return absArr;
		  }
		  return Math.abs(val);
		};
		var defaultCurveSegments = 150;
		var degToRads = Math.PI / 180;
		var roundCorner = 0.5519;

		function BMEnterFrameEvent(type, currentTime, totalTime, frameMultiplier) {
		  this.type = type;
		  this.currentTime = currentTime;
		  this.totalTime = totalTime;
		  this.direction = frameMultiplier < 0 ? -1 : 1;
		}

		function BMCompleteEvent(type, frameMultiplier) {
		  this.type = type;
		  this.direction = frameMultiplier < 0 ? -1 : 1;
		}

		function BMCompleteLoopEvent(type, totalLoops, currentLoop, frameMultiplier) {
		  this.type = type;
		  this.currentLoop = currentLoop;
		  this.totalLoops = totalLoops;
		  this.direction = frameMultiplier < 0 ? -1 : 1;
		}

		function BMSegmentStartEvent(type, firstFrame, totalFrames) {
		  this.type = type;
		  this.firstFrame = firstFrame;
		  this.totalFrames = totalFrames;
		}

		function BMDestroyEvent(type, target) {
		  this.type = type;
		  this.target = target;
		}

		function BMRenderFrameErrorEvent(nativeError, currentTime) {
		  this.type = 'renderFrameError';
		  this.nativeError = nativeError;
		  this.currentTime = currentTime;
		}

		function BMConfigErrorEvent(nativeError) {
		  this.type = 'configError';
		  this.nativeError = nativeError;
		}

		var createElementID = (function () {
		  var _count = 0;
		  return function createID() {
		    _count += 1;
		    return idPrefix + '__lottie_element_' + _count;
		  };
		}());

		function HSVtoRGB(h, s, v) {
		  var r;
		  var g;
		  var b;
		  var i;
		  var f;
		  var p;
		  var q;
		  var t;
		  i = Math.floor(h * 6);
		  f = h * 6 - i;
		  p = v * (1 - s);
		  q = v * (1 - f * s);
		  t = v * (1 - (1 - f) * s);
		  switch (i % 6) {
		    case 0: r = v; g = t; b = p; break;
		    case 1: r = q; g = v; b = p; break;
		    case 2: r = p; g = v; b = t; break;
		    case 3: r = p; g = q; b = v; break;
		    case 4: r = t; g = p; b = v; break;
		    case 5: r = v; g = p; b = q; break;
		  }
		  return [r,
		    g,
		    b];
		}

		function RGBtoHSV(r, g, b) {
		  var max = Math.max(r, g, b);
		  var min = Math.min(r, g, b);
		  var d = max - min;
		  var h;
		  var s = (max === 0 ? 0 : d / max);
		  var v = max / 255;

		  switch (max) {
		    case min: h = 0; break;
		    case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
		    case g: h = (b - r) + d * 2; h /= 6 * d; break;
		    case b: h = (r - g) + d * 4; h /= 6 * d; break;
		  }

		  return [
		    h,
		    s,
		    v,
		  ];
		}

		function addSaturationToRGB(color, offset) {
		  var hsv = RGBtoHSV(color[0] * 255, color[1] * 255, color[2] * 255);
		  hsv[1] += offset;
		  if (hsv[1] > 1) {
		    hsv[1] = 1;
		  } else if (hsv[1] <= 0) {
		    hsv[1] = 0;
		  }
		  return HSVtoRGB(hsv[0], hsv[1], hsv[2]);
		}

		function addBrightnessToRGB(color, offset) {
		  var hsv = RGBtoHSV(color[0] * 255, color[1] * 255, color[2] * 255);
		  hsv[2] += offset;
		  if (hsv[2] > 1) {
		    hsv[2] = 1;
		  } else if (hsv[2] < 0) {
		    hsv[2] = 0;
		  }
		  return HSVtoRGB(hsv[0], hsv[1], hsv[2]);
		}

		function addHueToRGB(color, offset) {
		  var hsv = RGBtoHSV(color[0] * 255, color[1] * 255, color[2] * 255);
		  hsv[0] += offset / 360;
		  if (hsv[0] > 1) {
		    hsv[0] -= 1;
		  } else if (hsv[0] < 0) {
		    hsv[0] += 1;
		  }
		  return HSVtoRGB(hsv[0], hsv[1], hsv[2]);
		}

		((function () {
		  var colorMap = [];
		  var i;
		  var hex;
		  for (i = 0; i < 256; i += 1) {
		    hex = i.toString(16);
		    colorMap[i] = hex.length === 1 ? '0' + hex : hex;
		  }

		  return function (r, g, b) {
		    if (r < 0) {
		      r = 0;
		    }
		    if (g < 0) {
		      g = 0;
		    }
		    if (b < 0) {
		      b = 0;
		    }
		    return '#' + colorMap[r] + colorMap[g] + colorMap[b];
		  };
		})());

		function BaseEvent() {}
		BaseEvent.prototype = {
		  triggerEvent: function (eventName, args) {
		    if (this._cbs[eventName]) {
		      var callbacks = this._cbs[eventName];
		      for (var i = 0; i < callbacks.length; i += 1) {
		        callbacks[i](args);
		      }
		    }
		  },
		  addEventListener: function (eventName, callback) {
		    if (!this._cbs[eventName]) {
		      this._cbs[eventName] = [];
		    }
		    this._cbs[eventName].push(callback);

		    return function () {
		      this.removeEventListener(eventName, callback);
		    }.bind(this);
		  },
		  removeEventListener: function (eventName, callback) {
		    if (!callback) {
		      this._cbs[eventName] = null;
		    } else if (this._cbs[eventName]) {
		      var i = 0;
		      var len = this._cbs[eventName].length;
		      while (i < len) {
		        if (this._cbs[eventName][i] === callback) {
		          this._cbs[eventName].splice(i, 1);
		          i -= 1;
		          len -= 1;
		        }
		        i += 1;
		      }
		      if (!this._cbs[eventName].length) {
		        this._cbs[eventName] = null;
		      }
		    }
		  },
		};

		/* exported createTypedArray, createSizedArray */

		var createTypedArray = (function () {
		  function createRegularArray(type, len) {
		    var i = 0;
		    var arr = [];
		    var value;
		    switch (type) {
		      case 'int16':
		      case 'uint8c':
		        value = 1;
		        break;
		      default:
		        value = 1.1;
		        break;
		    }
		    for (i = 0; i < len; i += 1) {
		      arr.push(value);
		    }
		    return arr;
		  }
		  function createTypedArrayFactory(type, len) {
		    if (type === 'float32') {
		      return new Float32Array(len);
		    } if (type === 'int16') {
		      return new Int16Array(len);
		    } if (type === 'uint8c') {
		      return new Uint8ClampedArray(len);
		    }
		    return createRegularArray(type, len);
		  }
		  if (typeof Uint8ClampedArray === 'function' && typeof Float32Array === 'function') {
		    return createTypedArrayFactory;
		  }
		  return createRegularArray;
		}());

		function createSizedArray(len) {
		  return Array.apply(null, { length: len });
		}

		/* global svgNS */
		/* exported createNS */

		function createNS(type) {
		  // return {appendChild:function(){},setAttribute:function(){},style:{}}
		  return document.createElementNS(svgNS, type);
		}

		/* exported createTag */

		function createTag(type) {
		  // return {appendChild:function(){},setAttribute:function(){},style:{}}
		  return document.createElement(type);
		}

		function DynamicPropertyContainer() {}
		DynamicPropertyContainer.prototype = {
		  addDynamicProperty: function (prop) {
		    if (this.dynamicProperties.indexOf(prop) === -1) {
		      this.dynamicProperties.push(prop);
		      this.container.addDynamicProperty(this);
		      this._isAnimated = true;
		    }
		  },
		  iterateDynamicProperties: function () {
		    this._mdf = false;
		    var i;
		    var len = this.dynamicProperties.length;
		    for (i = 0; i < len; i += 1) {
		      this.dynamicProperties[i].getValue();
		      if (this.dynamicProperties[i]._mdf) {
		        this._mdf = true;
		      }
		    }
		  },
		  initDynamicPropertyContainer: function (container) {
		    this.container = container;
		    this.dynamicProperties = [];
		    this._mdf = false;
		    this._isAnimated = false;
		  },
		};

		/* exported getBlendMode */

		var getBlendMode = (function () {
		  var blendModeEnums = {
		    0: 'source-over',
		    1: 'multiply',
		    2: 'screen',
		    3: 'overlay',
		    4: 'darken',
		    5: 'lighten',
		    6: 'color-dodge',
		    7: 'color-burn',
		    8: 'hard-light',
		    9: 'soft-light',
		    10: 'difference',
		    11: 'exclusion',
		    12: 'hue',
		    13: 'saturation',
		    14: 'color',
		    15: 'luminosity',
		  };

		  return function (mode) {
		    return blendModeEnums[mode] || '';
		  };
		}());

		/* exported lineCapEnum, lineJoinEnum */

		var lineCapEnum = {
		  1: 'butt',
		  2: 'round',
		  3: 'square',
		};

		var lineJoinEnum = {
		  1: 'miter',
		  2: 'round',
		  3: 'bevel',
		};

		/* global createTypedArray */

		/*!
		 Transformation Matrix v2.0
		 (c) Epistemex 2014-2015
		 www.epistemex.com
		 By Ken Fyrstenberg
		 Contributions by leeoniya.
		 License: MIT, header required.
		 */

		/**
		 * 2D transformation matrix object initialized with identity matrix.
		 *
		 * The matrix can synchronize a canvas context by supplying the context
		 * as an argument, or later apply current absolute transform to an
		 * existing context.
		 *
		 * All values are handled as floating point values.
		 *
		 * @param {CanvasRenderingContext2D} [context] - Optional context to sync with Matrix
		 * @prop {number} a - scale x
		 * @prop {number} b - shear y
		 * @prop {number} c - shear x
		 * @prop {number} d - scale y
		 * @prop {number} e - translate x
		 * @prop {number} f - translate y
		 * @prop {CanvasRenderingContext2D|null} [context=null] - set or get current canvas context
		 * @constructor
		 */

		var Matrix = (function () {
		  var _cos = Math.cos;
		  var _sin = Math.sin;
		  var _tan = Math.tan;
		  var _rnd = Math.round;

		  function reset() {
		    this.props[0] = 1;
		    this.props[1] = 0;
		    this.props[2] = 0;
		    this.props[3] = 0;
		    this.props[4] = 0;
		    this.props[5] = 1;
		    this.props[6] = 0;
		    this.props[7] = 0;
		    this.props[8] = 0;
		    this.props[9] = 0;
		    this.props[10] = 1;
		    this.props[11] = 0;
		    this.props[12] = 0;
		    this.props[13] = 0;
		    this.props[14] = 0;
		    this.props[15] = 1;
		    return this;
		  }

		  function rotate(angle) {
		    if (angle === 0) {
		      return this;
		    }
		    var mCos = _cos(angle);
		    var mSin = _sin(angle);
		    return this._t(mCos, -mSin, 0, 0, mSin, mCos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
		  }

		  function rotateX(angle) {
		    if (angle === 0) {
		      return this;
		    }
		    var mCos = _cos(angle);
		    var mSin = _sin(angle);
		    return this._t(1, 0, 0, 0, 0, mCos, -mSin, 0, 0, mSin, mCos, 0, 0, 0, 0, 1);
		  }

		  function rotateY(angle) {
		    if (angle === 0) {
		      return this;
		    }
		    var mCos = _cos(angle);
		    var mSin = _sin(angle);
		    return this._t(mCos, 0, mSin, 0, 0, 1, 0, 0, -mSin, 0, mCos, 0, 0, 0, 0, 1);
		  }

		  function rotateZ(angle) {
		    if (angle === 0) {
		      return this;
		    }
		    var mCos = _cos(angle);
		    var mSin = _sin(angle);
		    return this._t(mCos, -mSin, 0, 0, mSin, mCos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
		  }

		  function shear(sx, sy) {
		    return this._t(1, sy, sx, 1, 0, 0);
		  }

		  function skew(ax, ay) {
		    return this.shear(_tan(ax), _tan(ay));
		  }

		  function skewFromAxis(ax, angle) {
		    var mCos = _cos(angle);
		    var mSin = _sin(angle);
		    return this._t(mCos, mSin, 0, 0, -mSin, mCos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
		      ._t(1, 0, 0, 0, _tan(ax), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
		      ._t(mCos, -mSin, 0, 0, mSin, mCos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
		    // return this._t(mCos, mSin, -mSin, mCos, 0, 0)._t(1, 0, _tan(ax), 1, 0, 0)._t(mCos, -mSin, mSin, mCos, 0, 0);
		  }

		  function scale(sx, sy, sz) {
		    if (!sz && sz !== 0) {
		      sz = 1;
		    }
		    if (sx === 1 && sy === 1 && sz === 1) {
		      return this;
		    }
		    return this._t(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1);
		  }

		  function setTransform(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p) {
		    this.props[0] = a;
		    this.props[1] = b;
		    this.props[2] = c;
		    this.props[3] = d;
		    this.props[4] = e;
		    this.props[5] = f;
		    this.props[6] = g;
		    this.props[7] = h;
		    this.props[8] = i;
		    this.props[9] = j;
		    this.props[10] = k;
		    this.props[11] = l;
		    this.props[12] = m;
		    this.props[13] = n;
		    this.props[14] = o;
		    this.props[15] = p;
		    return this;
		  }

		  function translate(tx, ty, tz) {
		    tz = tz || 0;
		    if (tx !== 0 || ty !== 0 || tz !== 0) {
		      return this._t(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1);
		    }
		    return this;
		  }

		  function transform(a2, b2, c2, d2, e2, f2, g2, h2, i2, j2, k2, l2, m2, n2, o2, p2) {
		    var _p = this.props;

		    if (a2 === 1 && b2 === 0 && c2 === 0 && d2 === 0 && e2 === 0 && f2 === 1 && g2 === 0 && h2 === 0 && i2 === 0 && j2 === 0 && k2 === 1 && l2 === 0) {
		      // NOTE: commenting this condition because TurboFan deoptimizes code when present
		      // if(m2 !== 0 || n2 !== 0 || o2 !== 0){
		      _p[12] = _p[12] * a2 + _p[15] * m2;
		      _p[13] = _p[13] * f2 + _p[15] * n2;
		      _p[14] = _p[14] * k2 + _p[15] * o2;
		      _p[15] *= p2;
		      // }
		      this._identityCalculated = false;
		      return this;
		    }

		    var a1 = _p[0];
		    var b1 = _p[1];
		    var c1 = _p[2];
		    var d1 = _p[3];
		    var e1 = _p[4];
		    var f1 = _p[5];
		    var g1 = _p[6];
		    var h1 = _p[7];
		    var i1 = _p[8];
		    var j1 = _p[9];
		    var k1 = _p[10];
		    var l1 = _p[11];
		    var m1 = _p[12];
		    var n1 = _p[13];
		    var o1 = _p[14];
		    var p1 = _p[15];

		    /* matrix order (canvas compatible):
		         * ace
		         * bdf
		         * 001
		         */
		    _p[0] = a1 * a2 + b1 * e2 + c1 * i2 + d1 * m2;
		    _p[1] = a1 * b2 + b1 * f2 + c1 * j2 + d1 * n2;
		    _p[2] = a1 * c2 + b1 * g2 + c1 * k2 + d1 * o2;
		    _p[3] = a1 * d2 + b1 * h2 + c1 * l2 + d1 * p2;

		    _p[4] = e1 * a2 + f1 * e2 + g1 * i2 + h1 * m2;
		    _p[5] = e1 * b2 + f1 * f2 + g1 * j2 + h1 * n2;
		    _p[6] = e1 * c2 + f1 * g2 + g1 * k2 + h1 * o2;
		    _p[7] = e1 * d2 + f1 * h2 + g1 * l2 + h1 * p2;

		    _p[8] = i1 * a2 + j1 * e2 + k1 * i2 + l1 * m2;
		    _p[9] = i1 * b2 + j1 * f2 + k1 * j2 + l1 * n2;
		    _p[10] = i1 * c2 + j1 * g2 + k1 * k2 + l1 * o2;
		    _p[11] = i1 * d2 + j1 * h2 + k1 * l2 + l1 * p2;

		    _p[12] = m1 * a2 + n1 * e2 + o1 * i2 + p1 * m2;
		    _p[13] = m1 * b2 + n1 * f2 + o1 * j2 + p1 * n2;
		    _p[14] = m1 * c2 + n1 * g2 + o1 * k2 + p1 * o2;
		    _p[15] = m1 * d2 + n1 * h2 + o1 * l2 + p1 * p2;

		    this._identityCalculated = false;
		    return this;
		  }

		  function isIdentity() {
		    if (!this._identityCalculated) {
		      this._identity = !(this.props[0] !== 1 || this.props[1] !== 0 || this.props[2] !== 0 || this.props[3] !== 0 || this.props[4] !== 0 || this.props[5] !== 1 || this.props[6] !== 0 || this.props[7] !== 0 || this.props[8] !== 0 || this.props[9] !== 0 || this.props[10] !== 1 || this.props[11] !== 0 || this.props[12] !== 0 || this.props[13] !== 0 || this.props[14] !== 0 || this.props[15] !== 1);
		      this._identityCalculated = true;
		    }
		    return this._identity;
		  }

		  function equals(matr) {
		    var i = 0;
		    while (i < 16) {
		      if (matr.props[i] !== this.props[i]) {
		        return false;
		      }
		      i += 1;
		    }
		    return true;
		  }

		  function clone(matr) {
		    var i;
		    for (i = 0; i < 16; i += 1) {
		      matr.props[i] = this.props[i];
		    }
		    return matr;
		  }

		  function cloneFromProps(props) {
		    var i;
		    for (i = 0; i < 16; i += 1) {
		      this.props[i] = props[i];
		    }
		  }

		  function applyToPoint(x, y, z) {
		    return {
		      x: x * this.props[0] + y * this.props[4] + z * this.props[8] + this.props[12],
		      y: x * this.props[1] + y * this.props[5] + z * this.props[9] + this.props[13],
		      z: x * this.props[2] + y * this.props[6] + z * this.props[10] + this.props[14],
		    };
		    /* return {
		         x: x * me.a + y * me.c + me.e,
		         y: x * me.b + y * me.d + me.f
		         }; */
		  }
		  function applyToX(x, y, z) {
		    return x * this.props[0] + y * this.props[4] + z * this.props[8] + this.props[12];
		  }
		  function applyToY(x, y, z) {
		    return x * this.props[1] + y * this.props[5] + z * this.props[9] + this.props[13];
		  }
		  function applyToZ(x, y, z) {
		    return x * this.props[2] + y * this.props[6] + z * this.props[10] + this.props[14];
		  }

		  function getInverseMatrix() {
		    var determinant = this.props[0] * this.props[5] - this.props[1] * this.props[4];
		    var a = this.props[5] / determinant;
		    var b = -this.props[1] / determinant;
		    var c = -this.props[4] / determinant;
		    var d = this.props[0] / determinant;
		    var e = (this.props[4] * this.props[13] - this.props[5] * this.props[12]) / determinant;
		    var f = -(this.props[0] * this.props[13] - this.props[1] * this.props[12]) / determinant;
		    var inverseMatrix = new Matrix();
		    inverseMatrix.props[0] = a;
		    inverseMatrix.props[1] = b;
		    inverseMatrix.props[4] = c;
		    inverseMatrix.props[5] = d;
		    inverseMatrix.props[12] = e;
		    inverseMatrix.props[13] = f;
		    return inverseMatrix;
		  }

		  function inversePoint(pt) {
		    var inverseMatrix = this.getInverseMatrix();
		    return inverseMatrix.applyToPointArray(pt[0], pt[1], pt[2] || 0);
		  }

		  function inversePoints(pts) {
		    var i;
		    var len = pts.length;
		    var retPts = [];
		    for (i = 0; i < len; i += 1) {
		      retPts[i] = inversePoint(pts[i]);
		    }
		    return retPts;
		  }

		  function applyToTriplePoints(pt1, pt2, pt3) {
		    var arr = createTypedArray('float32', 6);
		    if (this.isIdentity()) {
		      arr[0] = pt1[0];
		      arr[1] = pt1[1];
		      arr[2] = pt2[0];
		      arr[3] = pt2[1];
		      arr[4] = pt3[0];
		      arr[5] = pt3[1];
		    } else {
		      var p0 = this.props[0];
		      var p1 = this.props[1];
		      var p4 = this.props[4];
		      var p5 = this.props[5];
		      var p12 = this.props[12];
		      var p13 = this.props[13];
		      arr[0] = pt1[0] * p0 + pt1[1] * p4 + p12;
		      arr[1] = pt1[0] * p1 + pt1[1] * p5 + p13;
		      arr[2] = pt2[0] * p0 + pt2[1] * p4 + p12;
		      arr[3] = pt2[0] * p1 + pt2[1] * p5 + p13;
		      arr[4] = pt3[0] * p0 + pt3[1] * p4 + p12;
		      arr[5] = pt3[0] * p1 + pt3[1] * p5 + p13;
		    }
		    return arr;
		  }

		  function applyToPointArray(x, y, z) {
		    var arr;
		    if (this.isIdentity()) {
		      arr = [x, y, z];
		    } else {
		      arr = [
		        x * this.props[0] + y * this.props[4] + z * this.props[8] + this.props[12],
		        x * this.props[1] + y * this.props[5] + z * this.props[9] + this.props[13],
		        x * this.props[2] + y * this.props[6] + z * this.props[10] + this.props[14],
		      ];
		    }
		    return arr;
		  }

		  function applyToPointStringified(x, y) {
		    if (this.isIdentity()) {
		      return x + ',' + y;
		    }
		    var _p = this.props;
		    return Math.round((x * _p[0] + y * _p[4] + _p[12]) * 100) / 100 + ',' + Math.round((x * _p[1] + y * _p[5] + _p[13]) * 100) / 100;
		  }

		  function toCSS() {
		    // Doesn't make much sense to add this optimization. If it is an identity matrix, it's very likely this will get called only once since it won't be keyframed.
		    /* if(this.isIdentity()) {
		            return '';
		        } */
		    var i = 0;
		    var props = this.props;
		    var cssValue = 'matrix3d(';
		    var v = 10000;
		    while (i < 16) {
		      cssValue += _rnd(props[i] * v) / v;
		      cssValue += i === 15 ? ')' : ',';
		      i += 1;
		    }
		    return cssValue;
		  }

		  function roundMatrixProperty(val) {
		    var v = 10000;
		    if ((val < 0.000001 && val > 0) || (val > -1e-6 && val < 0)) {
		      return _rnd(val * v) / v;
		    }
		    return val;
		  }

		  function to2dCSS() {
		    // Doesn't make much sense to add this optimization. If it is an identity matrix, it's very likely this will get called only once since it won't be keyframed.
		    /* if(this.isIdentity()) {
		            return '';
		        } */
		    var props = this.props;
		    var _a = roundMatrixProperty(props[0]);
		    var _b = roundMatrixProperty(props[1]);
		    var _c = roundMatrixProperty(props[4]);
		    var _d = roundMatrixProperty(props[5]);
		    var _e = roundMatrixProperty(props[12]);
		    var _f = roundMatrixProperty(props[13]);
		    return 'matrix(' + _a + ',' + _b + ',' + _c + ',' + _d + ',' + _e + ',' + _f + ')';
		  }

		  return function () {
		    this.reset = reset;
		    this.rotate = rotate;
		    this.rotateX = rotateX;
		    this.rotateY = rotateY;
		    this.rotateZ = rotateZ;
		    this.skew = skew;
		    this.skewFromAxis = skewFromAxis;
		    this.shear = shear;
		    this.scale = scale;
		    this.setTransform = setTransform;
		    this.translate = translate;
		    this.transform = transform;
		    this.applyToPoint = applyToPoint;
		    this.applyToX = applyToX;
		    this.applyToY = applyToY;
		    this.applyToZ = applyToZ;
		    this.applyToPointArray = applyToPointArray;
		    this.applyToTriplePoints = applyToTriplePoints;
		    this.applyToPointStringified = applyToPointStringified;
		    this.toCSS = toCSS;
		    this.to2dCSS = to2dCSS;
		    this.clone = clone;
		    this.cloneFromProps = cloneFromProps;
		    this.equals = equals;
		    this.inversePoints = inversePoints;
		    this.inversePoint = inversePoint;
		    this.getInverseMatrix = getInverseMatrix;
		    this._t = this.transform;
		    this.isIdentity = isIdentity;
		    this._identity = true;
		    this._identityCalculated = false;

		    this.props = createTypedArray('float32', 16);
		    this.reset();
		  };
		}());

		/* eslint-disable */
		/*
		 Copyright 2014 David Bau.

		 Permission is hereby granted, free of charge, to any person obtaining
		 a copy of this software and associated documentation files (the
		 "Software"), to deal in the Software without restriction, including
		 without limitation the rights to use, copy, modify, merge, publish,
		 distribute, sublicense, and/or sell copies of the Software, and to
		 permit persons to whom the Software is furnished to do so, subject to
		 the following conditions:

		 The above copyright notice and this permission notice shall be
		 included in all copies or substantial portions of the Software.

		 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
		 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
		 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
		 IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
		 CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
		 TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
		 SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

		 */

		(function (pool, math) {
		//
		// The following constants are related to IEEE 754 limits.
		//
		    var global = this,
		        width = 256,        // each RC4 output is 0 <= x < 256
		        chunks = 6,         // at least six RC4 outputs for each double
		        digits = 52,        // there are 52 significant digits in a double
		        rngname = 'random', // rngname: name for Math.random and Math.seedrandom
		        startdenom = math.pow(width, chunks),
		        significance = math.pow(2, digits),
		        overflow = significance * 2,
		        mask = width - 1,
		        nodecrypto;         // node.js crypto module, initialized at the bottom.

		//
		// seedrandom()
		// This is the seedrandom function described above.
		//
		    function seedrandom(seed, options, callback) {
		        var key = [];
		        options = (options === true) ? { entropy: true } : (options || {});

		        // Flatten the seed string or build one from local entropy if needed.
		        var shortseed = mixkey(flatten(
		            options.entropy ? [seed, tostring(pool)] :
		                (seed === null) ? autoseed() : seed, 3), key);

		        // Use the seed to initialize an ARC4 generator.
		        var arc4 = new ARC4(key);

		        // This function returns a random double in [0, 1) that contains
		        // randomness in every bit of the mantissa of the IEEE 754 value.
		        var prng = function() {
		            var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
		                d = startdenom,                 //   and denominator d = 2 ^ 48.
		                x = 0;                          //   and no 'extra last byte'.
		            while (n < significance) {          // Fill up all significant digits by
		                n = (n + x) * width;              //   shifting numerator and
		                d *= width;                       //   denominator and generating a
		                x = arc4.g(1);                    //   new least-significant-byte.
		            }
		            while (n >= overflow) {             // To avoid rounding up, before adding
		                n /= 2;                           //   last byte, shift everything
		                d /= 2;                           //   right using integer math until
		                x >>>= 1;                         //   we have exactly the desired bits.
		            }
		            return (n + x) / d;                 // Form the number within [0, 1).
		        };

		        prng.int32 = function() { return arc4.g(4) | 0; };
		        prng.quick = function() { return arc4.g(4) / 0x100000000; };
		        prng.double = prng;

		        // Mix the randomness into accumulated entropy.
		        mixkey(tostring(arc4.S), pool);

		        // Calling convention: what to return as a function of prng, seed, is_math.
		        return (options.pass || callback ||
		        function(prng, seed, is_math_call, state) {
		            if (state) {
		                // Load the arc4 state from the given state if it has an S array.
		                if (state.S) { copy(state, arc4); }
		                // Only provide the .state method if requested via options.state.
		                prng.state = function() { return copy(arc4, {}); };
		            }

		            // If called as a method of Math (Math.seedrandom()), mutate
		            // Math.random because that is how seedrandom.js has worked since v1.0.
		            if (is_math_call) { math[rngname] = prng; return seed; }

		            // Otherwise, it is a newer calling convention, so return the
		            // prng directly.
		            else return prng;
		        })(
		            prng,
		            shortseed,
		            'global' in options ? options.global : (this == math),
		            options.state);
		    }
		    math['seed' + rngname] = seedrandom;

		//
		// ARC4
		//
		// An ARC4 implementation.  The constructor takes a key in the form of
		// an array of at most (width) integers that should be 0 <= x < (width).
		//
		// The g(count) method returns a pseudorandom integer that concatenates
		// the next (count) outputs from ARC4.  Its return value is a number x
		// that is in the range 0 <= x < (width ^ count).
		//
		    function ARC4(key) {
		        var t, keylen = key.length,
		            me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

		        // The empty key [] is treated as [0].
		        if (!keylen) { key = [keylen++]; }

		        // Set up S using the standard key scheduling algorithm.
		        while (i < width) {
		            s[i] = i++;
		        }
		        for (i = 0; i < width; i++) {
		            s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
		            s[j] = t;
		        }

		        // The "g" method returns the next (count) outputs as one number.
		        me.g = function(count) {
		            // Using instance members instead of closure state nearly doubles speed.
		            var t, r = 0,
		                i = me.i, j = me.j, s = me.S;
		            while (count--) {
		                t = s[i = mask & (i + 1)];
		                r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
		            }
		            me.i = i; me.j = j;
		            return r;
		            // For robust unpredictability, the function call below automatically
		            // discards an initial batch of values.  This is called RC4-drop[256].
		            // See http://google.com/search?q=rsa+fluhrer+response&btnI
		        };
		    }

		//
		// copy()
		// Copies internal state of ARC4 to or from a plain object.
		//
		    function copy(f, t) {
		        t.i = f.i;
		        t.j = f.j;
		        t.S = f.S.slice();
		        return t;
		    }

		//
		// flatten()
		// Converts an object tree to nested arrays of strings.
		//
		    function flatten(obj, depth) {
		        var result = [], typ = (typeof obj), prop;
		        if (depth && typ == 'object') {
		            for (prop in obj) {
		                try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
		            }
		        }
		        return (result.length ? result : typ == 'string' ? obj : obj + '\0');
		    }

		//
		// mixkey()
		// Mixes a string seed into a key that is an array of integers, and
		// returns a shortened string seed that is equivalent to the result key.
		//
		    function mixkey(seed, key) {
		        var stringseed = seed + '', smear, j = 0;
		        while (j < stringseed.length) {
		            key[mask & j] =
		                mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
		        }
		        return tostring(key);
		    }

		//
		// autoseed()
		// Returns an object for autoseeding, using window.crypto and Node crypto
		// module if available.
		//
		    function autoseed() {
		        try {
		            if (nodecrypto) ;
		            var out = new Uint8Array(width);
		            (global.crypto || global.msCrypto).getRandomValues(out);
		            return tostring(out);
		        } catch (e) {
		            var browser = global.navigator,
		                plugins = browser && browser.plugins;
		            return [+new Date(), global, plugins, global.screen, tostring(pool)];
		        }
		    }

		//
		// tostring()
		// Converts an array of charcodes to a string
		//
		    function tostring(a) {
		        return String.fromCharCode.apply(0, a);
		    }

		//
		// When seedrandom.js is loaded, we immediately mix a few bits
		// from the built-in RNG into the entropy pool.  Because we do
		// not want to interfere with deterministic PRNG state later,
		// seedrandom will not call math.random on its own again after
		// initialization.
		//
		    mixkey(math.random(), pool);

		//
		// Nodejs and AMD support: export the implementation as a module using
		// either convention.
		//

		// End anonymous scope, and pass initial values.
		})(
		    [],     // pool: entropy pool starts empty
		    BMMath    // math: package containing random, pow, and seedrandom
		);
		/* eslint-disable */
		var BezierFactory = (function () {
		  /**
		     * BezierEasing - use bezier curve for transition easing function
		     * by Gaëtan Renaudeau 2014 - 2015 – MIT License
		     *
		     * Credits: is based on Firefox's nsSMILKeySpline.cpp
		     * Usage:
		     * var spline = BezierEasing([ 0.25, 0.1, 0.25, 1.0 ])
		     * spline.get(x) => returns the easing value | x must be in [0, 1] range
		     *
		     */

		  var ob = {};
		  ob.getBezierEasing = getBezierEasing;
		  var beziers = {};

		  function getBezierEasing(a, b, c, d, nm) {
		    var str = nm || ('bez_' + a + '_' + b + '_' + c + '_' + d).replace(/\./g, 'p');
		    if (beziers[str]) {
		      return beziers[str];
		    }
		    var bezEasing = new BezierEasing([a, b, c, d]);
		    beziers[str] = bezEasing;
		    return bezEasing;
		  }

		  // These values are established by empiricism with tests (tradeoff: performance VS precision)
		  var NEWTON_ITERATIONS = 4;
		  var NEWTON_MIN_SLOPE = 0.001;
		  var SUBDIVISION_PRECISION = 0.0000001;
		  var SUBDIVISION_MAX_ITERATIONS = 10;

		  var kSplineTableSize = 11;
		  var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

		  var float32ArraySupported = typeof Float32Array === 'function';

		  function A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
		  function B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
		  function C(aA1) { return 3.0 * aA1; }

		  // Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
		  function calcBezier(aT, aA1, aA2) {
		    return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
		  }

		  // Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
		  function getSlope(aT, aA1, aA2) {
		    return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
		  }

		  function binarySubdivide(aX, aA, aB, mX1, mX2) {
		    var currentX,
		      currentT,
		      i = 0;
		    do {
		      currentT = aA + (aB - aA) / 2.0;
		      currentX = calcBezier(currentT, mX1, mX2) - aX;
		      if (currentX > 0.0) {
		        aB = currentT;
		      } else {
		        aA = currentT;
		      }
		    } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
		    return currentT;
		  }

		  function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
		    for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
		      var currentSlope = getSlope(aGuessT, mX1, mX2);
		      if (currentSlope === 0.0) return aGuessT;
		      var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
		      aGuessT -= currentX / currentSlope;
		    }
		    return aGuessT;
		  }

		  /**
		     * points is an array of [ mX1, mY1, mX2, mY2 ]
		     */
		  function BezierEasing(points) {
		    this._p = points;
		    this._mSampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);
		    this._precomputed = false;

		    this.get = this.get.bind(this);
		  }

		  BezierEasing.prototype = {

		    get: function (x) {
		      var mX1 = this._p[0],
		        mY1 = this._p[1],
		        mX2 = this._p[2],
		        mY2 = this._p[3];
		      if (!this._precomputed) this._precompute();
		      if (mX1 === mY1 && mX2 === mY2) return x; // linear
		      // Because JavaScript number are imprecise, we should guarantee the extremes are right.
		      if (x === 0) return 0;
		      if (x === 1) return 1;
		      return calcBezier(this._getTForX(x), mY1, mY2);
		    },

		    // Private part

		    _precompute: function () {
		      var mX1 = this._p[0],
		        mY1 = this._p[1],
		        mX2 = this._p[2],
		        mY2 = this._p[3];
		      this._precomputed = true;
		      if (mX1 !== mY1 || mX2 !== mY2) { this._calcSampleValues(); }
		    },

		    _calcSampleValues: function () {
		      var mX1 = this._p[0],
		        mX2 = this._p[2];
		      for (var i = 0; i < kSplineTableSize; ++i) {
		        this._mSampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
		      }
		    },

		    /**
		         * getTForX chose the fastest heuristic to determine the percentage value precisely from a given X projection.
		         */
		    _getTForX: function (aX) {
		      var mX1 = this._p[0],
		        mX2 = this._p[2],
		        mSampleValues = this._mSampleValues;

		      var intervalStart = 0.0;
		      var currentSample = 1;
		      var lastSample = kSplineTableSize - 1;

		      for (; currentSample !== lastSample && mSampleValues[currentSample] <= aX; ++currentSample) {
		        intervalStart += kSampleStepSize;
		      }
		      --currentSample;

		      // Interpolate to provide an initial guess for t
		      var dist = (aX - mSampleValues[currentSample]) / (mSampleValues[currentSample + 1] - mSampleValues[currentSample]);
		      var guessForT = intervalStart + dist * kSampleStepSize;

		      var initialSlope = getSlope(guessForT, mX1, mX2);
		      if (initialSlope >= NEWTON_MIN_SLOPE) {
		        return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
		      } if (initialSlope === 0.0) {
		        return guessForT;
		      }
		      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
		    },
		  };

		  return ob;
		}());

		(function () {
		  var lastTime = 0;
		  var vendors = ['ms', 'moz', 'webkit', 'o'];
		  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) { // eslint-disable-line no-plusplus
		    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
		    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
		  }
		  if (!window.requestAnimationFrame) {
		    window.requestAnimationFrame = function (callback) {
		      var currTime = new Date().getTime();
		      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
		      var id = setTimeout(function () {
		        callback(currTime + timeToCall);
		      },
		      timeToCall);
		      lastTime = currTime + timeToCall;
		      return id;
		    };
		  }
		  if (!window.cancelAnimationFrame) {
		    window.cancelAnimationFrame = function (id) {
		      clearTimeout(id);
		    };
		  }
		}());

		/* exported extendPrototype, getDescriptor, createProxyFunction */

		function extendPrototype(sources, destination) {
		  var i;
		  var len = sources.length;
		  var sourcePrototype;
		  for (i = 0; i < len; i += 1) {
		    sourcePrototype = sources[i].prototype;
		    for (var attr in sourcePrototype) {
		      if (Object.prototype.hasOwnProperty.call(sourcePrototype, attr)) destination.prototype[attr] = sourcePrototype[attr];
		    }
		  }
		}

		function createProxyFunction(prototype) {
		  function ProxyFunction() {}
		  ProxyFunction.prototype = prototype;
		  return ProxyFunction;
		}

		/* global segmentsLengthPool, defaultCurveSegments, createSizedArray, bmPow, bmSqrt, bmFloor, createTypedArray, bezierLengthPool */
		/* exported bez */

		function bezFunction() {
		  var math = Math;

		  function pointOnLine2D(x1, y1, x2, y2, x3, y3) {
		    var det1 = (x1 * y2) + (y1 * x3) + (x2 * y3) - (x3 * y2) - (y3 * x1) - (x2 * y1);
		    return det1 > -1e-3 && det1 < 0.001;
		  }

		  function pointOnLine3D(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
		    if (z1 === 0 && z2 === 0 && z3 === 0) {
		      return pointOnLine2D(x1, y1, x2, y2, x3, y3);
		    }
		    var dist1 = math.sqrt(math.pow(x2 - x1, 2) + math.pow(y2 - y1, 2) + math.pow(z2 - z1, 2));
		    var dist2 = math.sqrt(math.pow(x3 - x1, 2) + math.pow(y3 - y1, 2) + math.pow(z3 - z1, 2));
		    var dist3 = math.sqrt(math.pow(x3 - x2, 2) + math.pow(y3 - y2, 2) + math.pow(z3 - z2, 2));
		    var diffDist;
		    if (dist1 > dist2) {
		      if (dist1 > dist3) {
		        diffDist = dist1 - dist2 - dist3;
		      } else {
		        diffDist = dist3 - dist2 - dist1;
		      }
		    } else if (dist3 > dist2) {
		      diffDist = dist3 - dist2 - dist1;
		    } else {
		      diffDist = dist2 - dist1 - dist3;
		    }
		    return diffDist > -1e-4 && diffDist < 0.0001;
		  }

		  var getBezierLength = (function () {
		    return function (pt1, pt2, pt3, pt4) {
		      var curveSegments = defaultCurveSegments;
		      var k;
		      var i;
		      var len;
		      var ptCoord;
		      var perc;
		      var addedLength = 0;
		      var ptDistance;
		      var point = [];
		      var lastPoint = [];
		      var lengthData = bezierLengthPool.newElement();
		      len = pt3.length;
		      for (k = 0; k < curveSegments; k += 1) {
		        perc = k / (curveSegments - 1);
		        ptDistance = 0;
		        for (i = 0; i < len; i += 1) {
		          ptCoord = bmPow(1 - perc, 3) * pt1[i] + 3 * bmPow(1 - perc, 2) * perc * pt3[i] + 3 * (1 - perc) * bmPow(perc, 2) * pt4[i] + bmPow(perc, 3) * pt2[i];
		          point[i] = ptCoord;
		          if (lastPoint[i] !== null) {
		            ptDistance += bmPow(point[i] - lastPoint[i], 2);
		          }
		          lastPoint[i] = point[i];
		        }
		        if (ptDistance) {
		          ptDistance = bmSqrt(ptDistance);
		          addedLength += ptDistance;
		        }
		        lengthData.percents[k] = perc;
		        lengthData.lengths[k] = addedLength;
		      }
		      lengthData.addedLength = addedLength;
		      return lengthData;
		    };
		  }());

		  function getSegmentsLength(shapeData) {
		    var segmentsLength = segmentsLengthPool.newElement();
		    var closed = shapeData.c;
		    var pathV = shapeData.v;
		    var pathO = shapeData.o;
		    var pathI = shapeData.i;
		    var i;
		    var len = shapeData._length;
		    var lengths = segmentsLength.lengths;
		    var totalLength = 0;
		    for (i = 0; i < len - 1; i += 1) {
		      lengths[i] = getBezierLength(pathV[i], pathV[i + 1], pathO[i], pathI[i + 1]);
		      totalLength += lengths[i].addedLength;
		    }
		    if (closed && len) {
		      lengths[i] = getBezierLength(pathV[i], pathV[0], pathO[i], pathI[0]);
		      totalLength += lengths[i].addedLength;
		    }
		    segmentsLength.totalLength = totalLength;
		    return segmentsLength;
		  }

		  function BezierData(length) {
		    this.segmentLength = 0;
		    this.points = new Array(length);
		  }

		  function PointData(partial, point) {
		    this.partialLength = partial;
		    this.point = point;
		  }

		  var buildBezierData = (function () {
		    var storedData = {};

		    return function (pt1, pt2, pt3, pt4) {
		      var bezierName = (pt1[0] + '_' + pt1[1] + '_' + pt2[0] + '_' + pt2[1] + '_' + pt3[0] + '_' + pt3[1] + '_' + pt4[0] + '_' + pt4[1]).replace(/\./g, 'p');
		      if (!storedData[bezierName]) {
		        var curveSegments = defaultCurveSegments;
		        var k;
		        var i;
		        var len;
		        var ptCoord;
		        var perc;
		        var addedLength = 0;
		        var ptDistance;
		        var point;
		        var lastPoint = null;
		        if (pt1.length === 2 && (pt1[0] !== pt2[0] || pt1[1] !== pt2[1]) && pointOnLine2D(pt1[0], pt1[1], pt2[0], pt2[1], pt1[0] + pt3[0], pt1[1] + pt3[1]) && pointOnLine2D(pt1[0], pt1[1], pt2[0], pt2[1], pt2[0] + pt4[0], pt2[1] + pt4[1])) {
		          curveSegments = 2;
		        }
		        var bezierData = new BezierData(curveSegments);
		        len = pt3.length;
		        for (k = 0; k < curveSegments; k += 1) {
		          point = createSizedArray(len);
		          perc = k / (curveSegments - 1);
		          ptDistance = 0;
		          for (i = 0; i < len; i += 1) {
		            ptCoord = bmPow(1 - perc, 3) * pt1[i] + 3 * bmPow(1 - perc, 2) * perc * (pt1[i] + pt3[i]) + 3 * (1 - perc) * bmPow(perc, 2) * (pt2[i] + pt4[i]) + bmPow(perc, 3) * pt2[i];
		            point[i] = ptCoord;
		            if (lastPoint !== null) {
		              ptDistance += bmPow(point[i] - lastPoint[i], 2);
		            }
		          }
		          ptDistance = bmSqrt(ptDistance);
		          addedLength += ptDistance;
		          bezierData.points[k] = new PointData(ptDistance, point);
		          lastPoint = point;
		        }
		        bezierData.segmentLength = addedLength;
		        storedData[bezierName] = bezierData;
		      }
		      return storedData[bezierName];
		    };
		  }());

		  function getDistancePerc(perc, bezierData) {
		    var percents = bezierData.percents;
		    var lengths = bezierData.lengths;
		    var len = percents.length;
		    var initPos = bmFloor((len - 1) * perc);
		    var lengthPos = perc * bezierData.addedLength;
		    var lPerc = 0;
		    if (initPos === len - 1 || initPos === 0 || lengthPos === lengths[initPos]) {
		      return percents[initPos];
		    }
		    var dir = lengths[initPos] > lengthPos ? -1 : 1;
		    var flag = true;
		    while (flag) {
		      if (lengths[initPos] <= lengthPos && lengths[initPos + 1] > lengthPos) {
		        lPerc = (lengthPos - lengths[initPos]) / (lengths[initPos + 1] - lengths[initPos]);
		        flag = false;
		      } else {
		        initPos += dir;
		      }
		      if (initPos < 0 || initPos >= len - 1) {
		        // FIX for TypedArrays that don't store floating point values with enough accuracy
		        if (initPos === len - 1) {
		          return percents[initPos];
		        }
		        flag = false;
		      }
		    }
		    return percents[initPos] + (percents[initPos + 1] - percents[initPos]) * lPerc;
		  }

		  function getPointInSegment(pt1, pt2, pt3, pt4, percent, bezierData) {
		    var t1 = getDistancePerc(percent, bezierData);
		    var u1 = 1 - t1;
		    var ptX = math.round((u1 * u1 * u1 * pt1[0] + (t1 * u1 * u1 + u1 * t1 * u1 + u1 * u1 * t1) * pt3[0] + (t1 * t1 * u1 + u1 * t1 * t1 + t1 * u1 * t1) * pt4[0] + t1 * t1 * t1 * pt2[0]) * 1000) / 1000;
		    var ptY = math.round((u1 * u1 * u1 * pt1[1] + (t1 * u1 * u1 + u1 * t1 * u1 + u1 * u1 * t1) * pt3[1] + (t1 * t1 * u1 + u1 * t1 * t1 + t1 * u1 * t1) * pt4[1] + t1 * t1 * t1 * pt2[1]) * 1000) / 1000;
		    return [ptX, ptY];
		  }

		  var bezierSegmentPoints = createTypedArray('float32', 8);

		  function getNewSegment(pt1, pt2, pt3, pt4, startPerc, endPerc, bezierData) {
		    if (startPerc < 0) {
		      startPerc = 0;
		    } else if (startPerc > 1) {
		      startPerc = 1;
		    }
		    var t0 = getDistancePerc(startPerc, bezierData);
		    endPerc = endPerc > 1 ? 1 : endPerc;
		    var t1 = getDistancePerc(endPerc, bezierData);
		    var i;
		    var len = pt1.length;
		    var u0 = 1 - t0;
		    var u1 = 1 - t1;
		    var u0u0u0 = u0 * u0 * u0;
		    var t0u0u0_3 = t0 * u0 * u0 * 3; // eslint-disable-line camelcase
		    var t0t0u0_3 = t0 * t0 * u0 * 3; // eslint-disable-line camelcase
		    var t0t0t0 = t0 * t0 * t0;
		    //
		    var u0u0u1 = u0 * u0 * u1;
		    var t0u0u1_3 = t0 * u0 * u1 + u0 * t0 * u1 + u0 * u0 * t1; // eslint-disable-line camelcase
		    var t0t0u1_3 = t0 * t0 * u1 + u0 * t0 * t1 + t0 * u0 * t1; // eslint-disable-line camelcase
		    var t0t0t1 = t0 * t0 * t1;
		    //
		    var u0u1u1 = u0 * u1 * u1;
		    var t0u1u1_3 = t0 * u1 * u1 + u0 * t1 * u1 + u0 * u1 * t1; // eslint-disable-line camelcase
		    var t0t1u1_3 = t0 * t1 * u1 + u0 * t1 * t1 + t0 * u1 * t1; // eslint-disable-line camelcase
		    var t0t1t1 = t0 * t1 * t1;
		    //
		    var u1u1u1 = u1 * u1 * u1;
		    var t1u1u1_3 = t1 * u1 * u1 + u1 * t1 * u1 + u1 * u1 * t1; // eslint-disable-line camelcase
		    var t1t1u1_3 = t1 * t1 * u1 + u1 * t1 * t1 + t1 * u1 * t1; // eslint-disable-line camelcase
		    var t1t1t1 = t1 * t1 * t1;
		    for (i = 0; i < len; i += 1) {
		      bezierSegmentPoints[i * 4] = math.round((u0u0u0 * pt1[i] + t0u0u0_3 * pt3[i] + t0t0u0_3 * pt4[i] + t0t0t0 * pt2[i]) * 1000) / 1000; // eslint-disable-line camelcase
		      bezierSegmentPoints[i * 4 + 1] = math.round((u0u0u1 * pt1[i] + t0u0u1_3 * pt3[i] + t0t0u1_3 * pt4[i] + t0t0t1 * pt2[i]) * 1000) / 1000; // eslint-disable-line camelcase
		      bezierSegmentPoints[i * 4 + 2] = math.round((u0u1u1 * pt1[i] + t0u1u1_3 * pt3[i] + t0t1u1_3 * pt4[i] + t0t1t1 * pt2[i]) * 1000) / 1000; // eslint-disable-line camelcase
		      bezierSegmentPoints[i * 4 + 3] = math.round((u1u1u1 * pt1[i] + t1u1u1_3 * pt3[i] + t1t1u1_3 * pt4[i] + t1t1t1 * pt2[i]) * 1000) / 1000; // eslint-disable-line camelcase
		    }

		    return bezierSegmentPoints;
		  }

		  return {
		    getSegmentsLength: getSegmentsLength,
		    getNewSegment: getNewSegment,
		    getPointInSegment: getPointInSegment,
		    buildBezierData: buildBezierData,
		    pointOnLine2D: pointOnLine2D,
		    pointOnLine3D: pointOnLine3D,
		  };
		}

		var bez = bezFunction();

		/* global _useWebWorker */

		var dataManager = (function () {
		  var _counterId = 1;
		  var processes = [];
		  var workerFn;
		  var workerInstance;
		  var workerProxy = {
		    onmessage: function () {

		    },
		    postMessage: function (path) {
		      workerFn({
		        data: path,
		      });
		    },
		  };
		  var _workerSelf = {
		    postMessage: function (data) {
		      workerProxy.onmessage({
		        data: data,
		      });
		    },
		  };
		  function createWorker(fn) {
		    if (window.Worker && window.Blob && _useWebWorker) {
		      var blob = new Blob(['var _workerSelf = self; self.onmessage = ', fn.toString()], { type: 'text/javascript' });
		      // var blob = new Blob(['self.onmessage = ', fn.toString()], { type: 'text/javascript' });
		      var url = URL.createObjectURL(blob);
		      return new Worker(url);
		    }
		    workerFn = fn;
		    return workerProxy;
		  }

		  function setupWorker() {
		    if (!workerInstance) {
		      workerInstance = createWorker(function workerStart(e) {
		        /* exported dataManager */

		        function dataFunctionManager() {
		          // var tCanvasHelper = createTag('canvas').getContext('2d');

		          function completeLayers(layers, comps) {
		            var layerData;
		            var i;
		            var len = layers.length;
		            var j;
		            var jLen;
		            var k;
		            var kLen;
		            for (i = 0; i < len; i += 1) {
		              layerData = layers[i];
		              if (('ks' in layerData) && !layerData.completed) {
		                layerData.completed = true;
		                if (layerData.tt) {
		                  layers[i - 1].td = layerData.tt;
		                }
		                if (layerData.hasMask) {
		                  var maskProps = layerData.masksProperties;
		                  jLen = maskProps.length;
		                  for (j = 0; j < jLen; j += 1) {
		                    if (maskProps[j].pt.k.i) {
		                      convertPathsToAbsoluteValues(maskProps[j].pt.k);
		                    } else {
		                      kLen = maskProps[j].pt.k.length;
		                      for (k = 0; k < kLen; k += 1) {
		                        if (maskProps[j].pt.k[k].s) {
		                          convertPathsToAbsoluteValues(maskProps[j].pt.k[k].s[0]);
		                        }
		                        if (maskProps[j].pt.k[k].e) {
		                          convertPathsToAbsoluteValues(maskProps[j].pt.k[k].e[0]);
		                        }
		                      }
		                    }
		                  }
		                }
		                if (layerData.ty === 0) {
		                  layerData.layers = findCompLayers(layerData.refId, comps);
		                  completeLayers(layerData.layers, comps);
		                } else if (layerData.ty === 4) {
		                  completeShapes(layerData.shapes);
		                } else if (layerData.ty === 5) {
		                  completeText(layerData);
		                }
		              }
		            }
		          }

		          function findCompLayers(id, comps) {
		            var i = 0;
		            var len = comps.length;
		            while (i < len) {
		              if (comps[i].id === id) {
		                if (!comps[i].layers.__used) {
		                  comps[i].layers.__used = true;
		                  return comps[i].layers;
		                }
		                return JSON.parse(JSON.stringify(comps[i].layers));
		              }
		              i += 1;
		            }
		            return null;
		          }

		          function completeShapes(arr) {
		            var i;
		            var len = arr.length;
		            var j;
		            var jLen;
		            for (i = len - 1; i >= 0; i -= 1) {
		              if (arr[i].ty === 'sh') {
		                if (arr[i].ks.k.i) {
		                  convertPathsToAbsoluteValues(arr[i].ks.k);
		                } else {
		                  jLen = arr[i].ks.k.length;
		                  for (j = 0; j < jLen; j += 1) {
		                    if (arr[i].ks.k[j].s) {
		                      convertPathsToAbsoluteValues(arr[i].ks.k[j].s[0]);
		                    }
		                    if (arr[i].ks.k[j].e) {
		                      convertPathsToAbsoluteValues(arr[i].ks.k[j].e[0]);
		                    }
		                  }
		                }
		              } else if (arr[i].ty === 'gr') {
		                completeShapes(arr[i].it);
		              }
		            }
		          }

		          function convertPathsToAbsoluteValues(path) {
		            var i;
		            var len = path.i.length;
		            for (i = 0; i < len; i += 1) {
		              path.i[i][0] += path.v[i][0];
		              path.i[i][1] += path.v[i][1];
		              path.o[i][0] += path.v[i][0];
		              path.o[i][1] += path.v[i][1];
		            }
		          }

		          function checkVersion(minimum, animVersionString) {
		            var animVersion = animVersionString ? animVersionString.split('.') : [100, 100, 100];
		            if (minimum[0] > animVersion[0]) {
		              return true;
		            } if (animVersion[0] > minimum[0]) {
		              return false;
		            }
		            if (minimum[1] > animVersion[1]) {
		              return true;
		            } if (animVersion[1] > minimum[1]) {
		              return false;
		            }
		            if (minimum[2] > animVersion[2]) {
		              return true;
		            } if (animVersion[2] > minimum[2]) {
		              return false;
		            }
		            return null;
		          }

		          var checkText = (function () {
		            var minimumVersion = [4, 4, 14];

		            function updateTextLayer(textLayer) {
		              var documentData = textLayer.t.d;
		              textLayer.t.d = {
		                k: [
		                  {
		                    s: documentData,
		                    t: 0,
		                  },
		                ],
		              };
		            }

		            function iterateLayers(layers) {
		              var i;
		              var len = layers.length;
		              for (i = 0; i < len; i += 1) {
		                if (layers[i].ty === 5) {
		                  updateTextLayer(layers[i]);
		                }
		              }
		            }

		            return function (animationData) {
		              if (checkVersion(minimumVersion, animationData.v)) {
		                iterateLayers(animationData.layers);
		                if (animationData.assets) {
		                  var i;
		                  var len = animationData.assets.length;
		                  for (i = 0; i < len; i += 1) {
		                    if (animationData.assets[i].layers) {
		                      iterateLayers(animationData.assets[i].layers);
		                    }
		                  }
		                }
		              }
		            };
		          }());

		          var checkChars = (function () {
		            var minimumVersion = [4, 7, 99];
		            return function (animationData) {
		              if (animationData.chars && !checkVersion(minimumVersion, animationData.v)) {
		                var i;
		                var len = animationData.chars.length;
		                var j;
		                var jLen;
		                var pathData;
		                var paths;
		                for (i = 0; i < len; i += 1) {
		                  if (animationData.chars[i].data && animationData.chars[i].data.shapes) {
		                    paths = animationData.chars[i].data.shapes[0].it;
		                    jLen = paths.length;

		                    for (j = 0; j < jLen; j += 1) {
		                      pathData = paths[j].ks.k;
		                      if (!pathData.__converted) {
		                        convertPathsToAbsoluteValues(paths[j].ks.k);
		                        pathData.__converted = true;
		                      }
		                    }
		                  }
		                }
		              }
		            };
		          }());

		          var checkPathProperties = (function () {
		            var minimumVersion = [5, 7, 15];

		            function updateTextLayer(textLayer) {
		              var pathData = textLayer.t.p;
		              if (typeof pathData.a === 'number') {
		                pathData.a = {
		                  a: 0,
		                  k: pathData.a,
		                };
		              }
		              if (typeof pathData.p === 'number') {
		                pathData.p = {
		                  a: 0,
		                  k: pathData.p,
		                };
		              }
		              if (typeof pathData.r === 'number') {
		                pathData.r = {
		                  a: 0,
		                  k: pathData.r,
		                };
		              }
		            }

		            function iterateLayers(layers) {
		              var i;
		              var len = layers.length;
		              for (i = 0; i < len; i += 1) {
		                if (layers[i].ty === 5) {
		                  updateTextLayer(layers[i]);
		                }
		              }
		            }

		            return function (animationData) {
		              if (checkVersion(minimumVersion, animationData.v)) {
		                iterateLayers(animationData.layers);
		                if (animationData.assets) {
		                  var i;
		                  var len = animationData.assets.length;
		                  for (i = 0; i < len; i += 1) {
		                    if (animationData.assets[i].layers) {
		                      iterateLayers(animationData.assets[i].layers);
		                    }
		                  }
		                }
		              }
		            };
		          }());

		          var checkColors = (function () {
		            var minimumVersion = [4, 1, 9];

		            function iterateShapes(shapes) {
		              var i;
		              var len = shapes.length;
		              var j;
		              var jLen;
		              for (i = 0; i < len; i += 1) {
		                if (shapes[i].ty === 'gr') {
		                  iterateShapes(shapes[i].it);
		                } else if (shapes[i].ty === 'fl' || shapes[i].ty === 'st') {
		                  if (shapes[i].c.k && shapes[i].c.k[0].i) {
		                    jLen = shapes[i].c.k.length;
		                    for (j = 0; j < jLen; j += 1) {
		                      if (shapes[i].c.k[j].s) {
		                        shapes[i].c.k[j].s[0] /= 255;
		                        shapes[i].c.k[j].s[1] /= 255;
		                        shapes[i].c.k[j].s[2] /= 255;
		                        shapes[i].c.k[j].s[3] /= 255;
		                      }
		                      if (shapes[i].c.k[j].e) {
		                        shapes[i].c.k[j].e[0] /= 255;
		                        shapes[i].c.k[j].e[1] /= 255;
		                        shapes[i].c.k[j].e[2] /= 255;
		                        shapes[i].c.k[j].e[3] /= 255;
		                      }
		                    }
		                  } else {
		                    shapes[i].c.k[0] /= 255;
		                    shapes[i].c.k[1] /= 255;
		                    shapes[i].c.k[2] /= 255;
		                    shapes[i].c.k[3] /= 255;
		                  }
		                }
		              }
		            }

		            function iterateLayers(layers) {
		              var i;
		              var len = layers.length;
		              for (i = 0; i < len; i += 1) {
		                if (layers[i].ty === 4) {
		                  iterateShapes(layers[i].shapes);
		                }
		              }
		            }

		            return function (animationData) {
		              if (checkVersion(minimumVersion, animationData.v)) {
		                iterateLayers(animationData.layers);
		                if (animationData.assets) {
		                  var i;
		                  var len = animationData.assets.length;
		                  for (i = 0; i < len; i += 1) {
		                    if (animationData.assets[i].layers) {
		                      iterateLayers(animationData.assets[i].layers);
		                    }
		                  }
		                }
		              }
		            };
		          }());

		          var checkShapes = (function () {
		            var minimumVersion = [4, 4, 18];

		            function completeClosingShapes(arr) {
		              var i;
		              var len = arr.length;
		              var j;
		              var jLen;
		              for (i = len - 1; i >= 0; i -= 1) {
		                if (arr[i].ty === 'sh') {
		                  if (arr[i].ks.k.i) {
		                    arr[i].ks.k.c = arr[i].closed;
		                  } else {
		                    jLen = arr[i].ks.k.length;
		                    for (j = 0; j < jLen; j += 1) {
		                      if (arr[i].ks.k[j].s) {
		                        arr[i].ks.k[j].s[0].c = arr[i].closed;
		                      }
		                      if (arr[i].ks.k[j].e) {
		                        arr[i].ks.k[j].e[0].c = arr[i].closed;
		                      }
		                    }
		                  }
		                } else if (arr[i].ty === 'gr') {
		                  completeClosingShapes(arr[i].it);
		                }
		              }
		            }

		            function iterateLayers(layers) {
		              var layerData;
		              var i;
		              var len = layers.length;
		              var j;
		              var jLen;
		              var k;
		              var kLen;
		              for (i = 0; i < len; i += 1) {
		                layerData = layers[i];
		                if (layerData.hasMask) {
		                  var maskProps = layerData.masksProperties;
		                  jLen = maskProps.length;
		                  for (j = 0; j < jLen; j += 1) {
		                    if (maskProps[j].pt.k.i) {
		                      maskProps[j].pt.k.c = maskProps[j].cl;
		                    } else {
		                      kLen = maskProps[j].pt.k.length;
		                      for (k = 0; k < kLen; k += 1) {
		                        if (maskProps[j].pt.k[k].s) {
		                          maskProps[j].pt.k[k].s[0].c = maskProps[j].cl;
		                        }
		                        if (maskProps[j].pt.k[k].e) {
		                          maskProps[j].pt.k[k].e[0].c = maskProps[j].cl;
		                        }
		                      }
		                    }
		                  }
		                }
		                if (layerData.ty === 4) {
		                  completeClosingShapes(layerData.shapes);
		                }
		              }
		            }

		            return function (animationData) {
		              if (checkVersion(minimumVersion, animationData.v)) {
		                iterateLayers(animationData.layers);
		                if (animationData.assets) {
		                  var i;
		                  var len = animationData.assets.length;
		                  for (i = 0; i < len; i += 1) {
		                    if (animationData.assets[i].layers) {
		                      iterateLayers(animationData.assets[i].layers);
		                    }
		                  }
		                }
		              }
		            };
		          }());

		          function completeData(animationData) {
		            if (animationData.__complete) {
		              return;
		            }
		            checkColors(animationData);
		            checkText(animationData);
		            checkChars(animationData);
		            checkPathProperties(animationData);
		            checkShapes(animationData);
		            completeLayers(animationData.layers, animationData.assets);
		            animationData.__complete = true;
		          }

		          function completeText(data) {
		            if (data.t.a.length === 0 && !('m' in data.t.p)) {
		              data.singleShape = true;
		            }
		          }

		          var moduleOb = {};
		          moduleOb.completeData = completeData;
		          moduleOb.checkColors = checkColors;
		          moduleOb.checkChars = checkChars;
		          moduleOb.checkPathProperties = checkPathProperties;
		          moduleOb.checkShapes = checkShapes;
		          moduleOb.completeLayers = completeLayers;

		          return moduleOb;
		        }
		        if (!_workerSelf.dataManager) {
		          _workerSelf.dataManager = dataFunctionManager();
		        }

		        /* exported assetLoader */
		        if (!_workerSelf.assetLoader) {
		          _workerSelf.assetLoader = (function () {
		            function formatResponse(xhr) {
		              // using typeof doubles the time of execution of this method,
		              // so if available, it's better to use the header to validate the type
		              var contentTypeHeader = xhr.getResponseHeader('content-type');
		              if (contentTypeHeader && xhr.responseType === 'json' && contentTypeHeader.indexOf('json') !== -1) {
		                return xhr.response;
		              }
		              if (xhr.response && typeof xhr.response === 'object') {
		                return xhr.response;
		              } if (xhr.response && typeof xhr.response === 'string') {
		                return JSON.parse(xhr.response);
		              } if (xhr.responseText) {
		                return JSON.parse(xhr.responseText);
		              }
		              return null;
		            }

		            function loadAsset(path, fullPath, callback, errorCallback) {
		              var response;
		              var xhr = new XMLHttpRequest();
		              // set responseType after calling open or IE will break.
		              try {
		                // This crashes on Android WebView prior to KitKat
		                xhr.responseType = 'json';
		              } catch (err) {} // eslint-disable-line no-empty
		              xhr.onreadystatechange = function () {
		                if (xhr.readyState === 4) {
		                  if (xhr.status === 200) {
		                    response = formatResponse(xhr);
		                    callback(response);
		                  } else {
		                    try {
		                      response = formatResponse(xhr);
		                      callback(response);
		                    } catch (err) {
		                      if (errorCallback) {
		                        errorCallback(err);
		                      }
		                    }
		                  }
		                }
		              };
		              try {
		                xhr.open('GET', path, true);
		              } catch (error) {
		                xhr.open('GET', fullPath + '/' + path, true);
		              }
		              xhr.send();
		            }
		            return {
		              load: loadAsset,
		            };
		          }());
		        }

		        if (e.data.type === 'loadAnimation') {
		          _workerSelf.assetLoader.load(
		            e.data.path,
		            e.data.fullPath,
		            function (data) {
		              _workerSelf.dataManager.completeData(data);
		              _workerSelf.postMessage({
		                id: e.data.id,
		                payload: data,
		                status: 'success',
		              });
		            },
		            function () {
		              _workerSelf.postMessage({
		                id: e.data.id,
		                status: 'error',
		              });
		            }
		          );
		        } else if (e.data.type === 'complete') {
		          var animation = e.data.animation;
		          _workerSelf.dataManager.completeData(animation);
		          _workerSelf.postMessage({
		            id: e.data.id,
		            payload: animation,
		            status: 'success',
		          });
		        } else if (e.data.type === 'loadData') {
		          _workerSelf.assetLoader.load(
		            e.data.path,
		            e.data.fullPath,
		            function (data) {
		              _workerSelf.postMessage({
		                id: e.data.id,
		                payload: data,
		                status: 'success',
		              });
		            },
		            function () {
		              _workerSelf.postMessage({
		                id: e.data.id,
		                status: 'error',
		              });
		            }
		          );
		        }
		      });

		      workerInstance.onmessage = function (event) {
		        var data = event.data;
		        var id = data.id;
		        var process = processes[id];
		        processes[id] = null;
		        if (data.status === 'success') {
		          process.onComplete(data.payload);
		        } else if (process.onError) {
		          process.onError();
		        }
		      };
		    }
		  }

		  function createProcess(onComplete, onError) {
		    _counterId += 1;
		    var id = 'processId_' + _counterId;
		    processes[id] = {
		      onComplete: onComplete,
		      onError: onError,
		    };
		    return id;
		  }

		  function loadAnimation(path, onComplete, onError) {
		    setupWorker();
		    var processId = createProcess(onComplete, onError);
		    workerInstance.postMessage({
		      type: 'loadAnimation',
		      path: path,
		      fullPath: window.location.origin + window.location.pathname,
		      id: processId,
		    });
		  }

		  function loadData(path, onComplete, onError) {
		    setupWorker();
		    var processId = createProcess(onComplete, onError);
		    workerInstance.postMessage({
		      type: 'loadData',
		      path: path,
		      fullPath: window.location.origin + window.location.pathname,
		      id: processId,
		    });
		  }

		  function completeAnimation(anim, onComplete, onError) {
		    setupWorker();
		    var processId = createProcess(onComplete, onError);
		    workerInstance.postMessage({
		      type: 'complete',
		      animation: anim,
		      id: processId,
		    });
		  }

		  return {
		    loadAnimation: loadAnimation,
		    loadData: loadData,
		    completeAnimation: completeAnimation,
		  };
		}());

		/* exported getFontProperties */

		function getFontProperties(fontData) {
		  var styles = fontData.fStyle ? fontData.fStyle.split(' ') : [];

		  var fWeight = 'normal'; var
		    fStyle = 'normal';
		  var len = styles.length;
		  var styleName;
		  for (var i = 0; i < len; i += 1) {
		    styleName = styles[i].toLowerCase();
		    switch (styleName) {
		      case 'italic':
		        fStyle = 'italic';
		        break;
		      case 'bold':
		        fWeight = '700';
		        break;
		      case 'black':
		        fWeight = '900';
		        break;
		      case 'medium':
		        fWeight = '500';
		        break;
		      case 'regular':
		      case 'normal':
		        fWeight = '400';
		        break;
		      case 'light':
		      case 'thin':
		        fWeight = '200';
		        break;
		    }
		  }

		  return {
		    style: fStyle,
		    weight: fontData.fWeight || fWeight,
		  };
		}

		/* global createNS, createTag, getFontProperties */
		/* exported FontManager */

		var FontManager = (function () {
		  var maxWaitingTime = 5000;
		  var emptyChar = {
		    w: 0,
		    size: 0,
		    shapes: [],
		  };
		  var combinedCharacters = [];
		  // Hindi characters
		  combinedCharacters = combinedCharacters.concat([2304, 2305, 2306, 2307, 2362, 2363, 2364, 2364, 2366,
		    2367, 2368, 2369, 2370, 2371, 2372, 2373, 2374, 2375, 2376, 2377, 2378, 2379,
		    2380, 2381, 2382, 2383, 2387, 2388, 2389, 2390, 2391, 2402, 2403]);

		  var surrogateModifiers = [
		    'd83cdffb',
		    'd83cdffc',
		    'd83cdffd',
		    'd83cdffe',
		    'd83cdfff',
		  ];

		  var zeroWidthJoiner = [65039, 8205];

		  function trimFontOptions(font) {
		    var familyArray = font.split(',');
		    var i;
		    var len = familyArray.length;
		    var enabledFamilies = [];
		    for (i = 0; i < len; i += 1) {
		      if (familyArray[i] !== 'sans-serif' && familyArray[i] !== 'monospace') {
		        enabledFamilies.push(familyArray[i]);
		      }
		    }
		    return enabledFamilies.join(',');
		  }

		  function setUpNode(font, family) {
		    var parentNode = createTag('span');
		    // Node is invisible to screen readers.
		    parentNode.setAttribute('aria-hidden', true);
		    parentNode.style.fontFamily = family;
		    var node = createTag('span');
		    // Characters that vary significantly among different fonts
		    node.innerText = 'giItT1WQy@!-/#';
		    // Visible - so we can measure it - but not on the screen
		    parentNode.style.position = 'absolute';
		    parentNode.style.left = '-10000px';
		    parentNode.style.top = '-10000px';
		    // Large font size makes even subtle changes obvious
		    parentNode.style.fontSize = '300px';
		    // Reset any font properties
		    parentNode.style.fontVariant = 'normal';
		    parentNode.style.fontStyle = 'normal';
		    parentNode.style.fontWeight = 'normal';
		    parentNode.style.letterSpacing = '0';
		    parentNode.appendChild(node);
		    document.body.appendChild(parentNode);

		    // Remember width with no applied web font
		    var width = node.offsetWidth;
		    node.style.fontFamily = trimFontOptions(font) + ', ' + family;
		    return { node: node, w: width, parent: parentNode };
		  }

		  function checkLoadedFonts() {
		    var i;
		    var len = this.fonts.length;
		    var node;
		    var w;
		    var loadedCount = len;
		    for (i = 0; i < len; i += 1) {
		      if (this.fonts[i].loaded) {
		        loadedCount -= 1;
		      } else if (this.fonts[i].fOrigin === 'n' || this.fonts[i].origin === 0) {
		        this.fonts[i].loaded = true;
		      } else {
		        node = this.fonts[i].monoCase.node;
		        w = this.fonts[i].monoCase.w;
		        if (node.offsetWidth !== w) {
		          loadedCount -= 1;
		          this.fonts[i].loaded = true;
		        } else {
		          node = this.fonts[i].sansCase.node;
		          w = this.fonts[i].sansCase.w;
		          if (node.offsetWidth !== w) {
		            loadedCount -= 1;
		            this.fonts[i].loaded = true;
		          }
		        }
		        if (this.fonts[i].loaded) {
		          this.fonts[i].sansCase.parent.parentNode.removeChild(this.fonts[i].sansCase.parent);
		          this.fonts[i].monoCase.parent.parentNode.removeChild(this.fonts[i].monoCase.parent);
		        }
		      }
		    }

		    if (loadedCount !== 0 && Date.now() - this.initTime < maxWaitingTime) {
		      setTimeout(this.checkLoadedFontsBinded, 20);
		    } else {
		      setTimeout(this.setIsLoadedBinded, 10);
		    }
		  }

		  function createHelper(def, fontData) {
		    var tHelper = createNS('text');
		    tHelper.style.fontSize = '100px';
		    // tHelper.style.fontFamily = fontData.fFamily;

		    var fontProps = getFontProperties(fontData);
		    tHelper.setAttribute('font-family', fontData.fFamily);
		    tHelper.setAttribute('font-style', fontProps.style);
		    tHelper.setAttribute('font-weight', fontProps.weight);
		    tHelper.textContent = '1';
		    if (fontData.fClass) {
		      tHelper.style.fontFamily = 'inherit';
		      tHelper.setAttribute('class', fontData.fClass);
		    } else {
		      tHelper.style.fontFamily = fontData.fFamily;
		    }
		    def.appendChild(tHelper);
		    var tCanvasHelper = createTag('canvas').getContext('2d');
		    tCanvasHelper.font = fontData.fWeight + ' ' + fontData.fStyle + ' 100px ' + fontData.fFamily;
		    // tCanvasHelper.font = ' 100px '+ fontData.fFamily;
		    return tHelper;
		  }

		  function addFonts(fontData, defs) {
		    if (!fontData) {
		      this.isLoaded = true;
		      return;
		    }
		    if (this.chars) {
		      this.isLoaded = true;
		      this.fonts = fontData.list;
		      return;
		    }

		    var fontArr = fontData.list;
		    var i;
		    var len = fontArr.length;
		    var _pendingFonts = len;
		    for (i = 0; i < len; i += 1) {
		      var shouldLoadFont = true;
		      var loadedSelector;
		      var j;
		      fontArr[i].loaded = false;
		      fontArr[i].monoCase = setUpNode(fontArr[i].fFamily, 'monospace');
		      fontArr[i].sansCase = setUpNode(fontArr[i].fFamily, 'sans-serif');
		      if (!fontArr[i].fPath) {
		        fontArr[i].loaded = true;
		        _pendingFonts -= 1;
		      } else if (fontArr[i].fOrigin === 'p' || fontArr[i].origin === 3) {
		        loadedSelector = document.querySelectorAll('style[f-forigin="p"][f-family="' + fontArr[i].fFamily + '"], style[f-origin="3"][f-family="' + fontArr[i].fFamily + '"]');

		        if (loadedSelector.length > 0) {
		          shouldLoadFont = false;
		        }

		        if (shouldLoadFont) {
		          var s = createTag('style');
		          s.setAttribute('f-forigin', fontArr[i].fOrigin);
		          s.setAttribute('f-origin', fontArr[i].origin);
		          s.setAttribute('f-family', fontArr[i].fFamily);
		          s.type = 'text/css';
		          s.innerText = '@font-face {font-family: ' + fontArr[i].fFamily + "; font-style: normal; src: url('" + fontArr[i].fPath + "');}";
		          defs.appendChild(s);
		        }
		      } else if (fontArr[i].fOrigin === 'g' || fontArr[i].origin === 1) {
		        loadedSelector = document.querySelectorAll('link[f-forigin="g"], link[f-origin="1"]');

		        for (j = 0; j < loadedSelector.length; j += 1) {
		          if (loadedSelector[j].href.indexOf(fontArr[i].fPath) !== -1) {
		            // Font is already loaded
		            shouldLoadFont = false;
		          }
		        }

		        if (shouldLoadFont) {
		          var l = createTag('link');
		          l.setAttribute('f-forigin', fontArr[i].fOrigin);
		          l.setAttribute('f-origin', fontArr[i].origin);
		          l.type = 'text/css';
		          l.rel = 'stylesheet';
		          l.href = fontArr[i].fPath;
		          document.body.appendChild(l);
		        }
		      } else if (fontArr[i].fOrigin === 't' || fontArr[i].origin === 2) {
		        loadedSelector = document.querySelectorAll('script[f-forigin="t"], script[f-origin="2"]');

		        for (j = 0; j < loadedSelector.length; j += 1) {
		          if (fontArr[i].fPath === loadedSelector[j].src) {
		            // Font is already loaded
		            shouldLoadFont = false;
		          }
		        }

		        if (shouldLoadFont) {
		          var sc = createTag('link');
		          sc.setAttribute('f-forigin', fontArr[i].fOrigin);
		          sc.setAttribute('f-origin', fontArr[i].origin);
		          sc.setAttribute('rel', 'stylesheet');
		          sc.setAttribute('href', fontArr[i].fPath);
		          defs.appendChild(sc);
		        }
		      }
		      fontArr[i].helper = createHelper(defs, fontArr[i]);
		      fontArr[i].cache = {};
		      this.fonts.push(fontArr[i]);
		    }
		    if (_pendingFonts === 0) {
		      this.isLoaded = true;
		    } else {
		      // On some cases even if the font is loaded, it won't load correctly when measuring text on canvas.
		      // Adding this timeout seems to fix it
		      setTimeout(this.checkLoadedFonts.bind(this), 100);
		    }
		  }

		  function addChars(chars) {
		    if (!chars) {
		      return;
		    }
		    if (!this.chars) {
		      this.chars = [];
		    }
		    var i;
		    var len = chars.length;
		    var j;
		    var jLen = this.chars.length;
		    var found;
		    for (i = 0; i < len; i += 1) {
		      j = 0;
		      found = false;
		      while (j < jLen) {
		        if (this.chars[j].style === chars[i].style && this.chars[j].fFamily === chars[i].fFamily && this.chars[j].ch === chars[i].ch) {
		          found = true;
		        }
		        j += 1;
		      }
		      if (!found) {
		        this.chars.push(chars[i]);
		        jLen += 1;
		      }
		    }
		  }

		  function getCharData(char, style, font) {
		    var i = 0;
		    var len = this.chars.length;
		    while (i < len) {
		      if (this.chars[i].ch === char && this.chars[i].style === style && this.chars[i].fFamily === font) {
		        return this.chars[i];
		      }
		      i += 1;
		    }
		    if (((typeof char === 'string' && char.charCodeAt(0) !== 13) || !char)
		            && console
		            && console.warn // eslint-disable-line no-console
		            && !this._warned
		    ) {
		      this._warned = true;
		      console.warn('Missing character from exported characters list: ', char, style, font); // eslint-disable-line no-console
		    }
		    return emptyChar;
		  }

		  function measureText(char, fontName, size) {
		    var fontData = this.getFontByName(fontName);
		    var index = char.charCodeAt(0);
		    if (!fontData.cache[index + 1]) {
		      var tHelper = fontData.helper;
		      // Canvas version
		      // fontData.cache[index] = tHelper.measureText(char).width / 100;
		      // SVG version
		      // console.log(tHelper.getBBox().width)
		      if (char === ' ') {
		        tHelper.textContent = '|' + char + '|';
		        var doubleSize = tHelper.getComputedTextLength();
		        tHelper.textContent = '||';
		        var singleSize = tHelper.getComputedTextLength();
		        fontData.cache[index + 1] = (doubleSize - singleSize) / 100;
		      } else {
		        tHelper.textContent = char;
		        fontData.cache[index + 1] = (tHelper.getComputedTextLength()) / 100;
		      }
		    }
		    return fontData.cache[index + 1] * size;
		  }

		  function getFontByName(name) {
		    var i = 0;
		    var len = this.fonts.length;
		    while (i < len) {
		      if (this.fonts[i].fName === name) {
		        return this.fonts[i];
		      }
		      i += 1;
		    }
		    return this.fonts[0];
		  }

		  function isModifier(firstCharCode, secondCharCode) {
		    var sum = firstCharCode.toString(16) + secondCharCode.toString(16);
		    return surrogateModifiers.indexOf(sum) !== -1;
		  }

		  function isZeroWidthJoiner(firstCharCode, secondCharCode) {
		    if (!secondCharCode) {
		      return firstCharCode === zeroWidthJoiner[1];
		    }
		    return firstCharCode === zeroWidthJoiner[0] && secondCharCode === zeroWidthJoiner[1];
		  }

		  function isCombinedCharacter(char) {
		    return combinedCharacters.indexOf(char) !== -1;
		  }

		  function setIsLoaded() {
		    this.isLoaded = true;
		  }

		  var Font = function () {
		    this.fonts = [];
		    this.chars = null;
		    this.typekitLoaded = 0;
		    this.isLoaded = false;
		    this._warned = false;
		    this.initTime = Date.now();
		    this.setIsLoadedBinded = this.setIsLoaded.bind(this);
		    this.checkLoadedFontsBinded = this.checkLoadedFonts.bind(this);
		  };
		  Font.isModifier = isModifier;
		  Font.isZeroWidthJoiner = isZeroWidthJoiner;
		  Font.isCombinedCharacter = isCombinedCharacter;

		  var fontPrototype = {
		    addChars: addChars,
		    addFonts: addFonts,
		    getCharData: getCharData,
		    getFontByName: getFontByName,
		    measureText: measureText,
		    checkLoadedFonts: checkLoadedFonts,
		    setIsLoaded: setIsLoaded,
		  };

		  Font.prototype = fontPrototype;

		  return Font;
		}());

		/* global initialDefaultFrame, BezierFactory, degToRads, bez, createTypedArray */
		/* exported PropertyFactory */

		var PropertyFactory = (function () {
		  var initFrame = initialDefaultFrame;
		  var mathAbs = Math.abs;

		  function interpolateValue(frameNum, caching) {
		    var offsetTime = this.offsetTime;
		    var newValue;
		    if (this.propType === 'multidimensional') {
		      newValue = createTypedArray('float32', this.pv.length);
		    }
		    var iterationIndex = caching.lastIndex;
		    var i = iterationIndex;
		    var len = this.keyframes.length - 1;
		    var flag = true;
		    var keyData;
		    var nextKeyData;
		    var keyframeMetadata;

		    while (flag) {
		      keyData = this.keyframes[i];
		      nextKeyData = this.keyframes[i + 1];
		      if (i === len - 1 && frameNum >= nextKeyData.t - offsetTime) {
		        if (keyData.h) {
		          keyData = nextKeyData;
		        }
		        iterationIndex = 0;
		        break;
		      }
		      if ((nextKeyData.t - offsetTime) > frameNum) {
		        iterationIndex = i;
		        break;
		      }
		      if (i < len - 1) {
		        i += 1;
		      } else {
		        iterationIndex = 0;
		        flag = false;
		      }
		    }
		    keyframeMetadata = this.keyframesMetadata[i] || {};

		    var k;
		    var kLen;
		    var perc;
		    var jLen;
		    var j;
		    var fnc;
		    var nextKeyTime = nextKeyData.t - offsetTime;
		    var keyTime = keyData.t - offsetTime;
		    var endValue;
		    if (keyData.to) {
		      if (!keyframeMetadata.bezierData) {
		        keyframeMetadata.bezierData = bez.buildBezierData(keyData.s, nextKeyData.s || keyData.e, keyData.to, keyData.ti);
		      }
		      var bezierData = keyframeMetadata.bezierData;
		      if (frameNum >= nextKeyTime || frameNum < keyTime) {
		        var ind = frameNum >= nextKeyTime ? bezierData.points.length - 1 : 0;
		        kLen = bezierData.points[ind].point.length;
		        for (k = 0; k < kLen; k += 1) {
		          newValue[k] = bezierData.points[ind].point[k];
		        }
		        // caching._lastKeyframeIndex = -1;
		      } else {
		        if (keyframeMetadata.__fnct) {
		          fnc = keyframeMetadata.__fnct;
		        } else {
		          fnc = BezierFactory.getBezierEasing(keyData.o.x, keyData.o.y, keyData.i.x, keyData.i.y, keyData.n).get;
		          keyframeMetadata.__fnct = fnc;
		        }
		        perc = fnc((frameNum - keyTime) / (nextKeyTime - keyTime));
		        var distanceInLine = bezierData.segmentLength * perc;

		        var segmentPerc;
		        var addedLength = (caching.lastFrame < frameNum && caching._lastKeyframeIndex === i) ? caching._lastAddedLength : 0;
		        j = (caching.lastFrame < frameNum && caching._lastKeyframeIndex === i) ? caching._lastPoint : 0;
		        flag = true;
		        jLen = bezierData.points.length;
		        while (flag) {
		          addedLength += bezierData.points[j].partialLength;
		          if (distanceInLine === 0 || perc === 0 || j === bezierData.points.length - 1) {
		            kLen = bezierData.points[j].point.length;
		            for (k = 0; k < kLen; k += 1) {
		              newValue[k] = bezierData.points[j].point[k];
		            }
		            break;
		          } else if (distanceInLine >= addedLength && distanceInLine < addedLength + bezierData.points[j + 1].partialLength) {
		            segmentPerc = (distanceInLine - addedLength) / bezierData.points[j + 1].partialLength;
		            kLen = bezierData.points[j].point.length;
		            for (k = 0; k < kLen; k += 1) {
		              newValue[k] = bezierData.points[j].point[k] + (bezierData.points[j + 1].point[k] - bezierData.points[j].point[k]) * segmentPerc;
		            }
		            break;
		          }
		          if (j < jLen - 1) {
		            j += 1;
		          } else {
		            flag = false;
		          }
		        }
		        caching._lastPoint = j;
		        caching._lastAddedLength = addedLength - bezierData.points[j].partialLength;
		        caching._lastKeyframeIndex = i;
		      }
		    } else {
		      var outX;
		      var outY;
		      var inX;
		      var inY;
		      var keyValue;
		      len = keyData.s.length;
		      endValue = nextKeyData.s || keyData.e;
		      if (this.sh && keyData.h !== 1) {
		        if (frameNum >= nextKeyTime) {
		          newValue[0] = endValue[0];
		          newValue[1] = endValue[1];
		          newValue[2] = endValue[2];
		        } else if (frameNum <= keyTime) {
		          newValue[0] = keyData.s[0];
		          newValue[1] = keyData.s[1];
		          newValue[2] = keyData.s[2];
		        } else {
		          var quatStart = createQuaternion(keyData.s);
		          var quatEnd = createQuaternion(endValue);
		          var time = (frameNum - keyTime) / (nextKeyTime - keyTime);
		          quaternionToEuler(newValue, slerp(quatStart, quatEnd, time));
		        }
		      } else {
		        for (i = 0; i < len; i += 1) {
		          if (keyData.h !== 1) {
		            if (frameNum >= nextKeyTime) {
		              perc = 1;
		            } else if (frameNum < keyTime) {
		              perc = 0;
		            } else {
		              if (keyData.o.x.constructor === Array) {
		                if (!keyframeMetadata.__fnct) {
		                  keyframeMetadata.__fnct = [];
		                }
		                if (!keyframeMetadata.__fnct[i]) {
		                  outX = keyData.o.x[i] === undefined ? keyData.o.x[0] : keyData.o.x[i];
		                  outY = keyData.o.y[i] === undefined ? keyData.o.y[0] : keyData.o.y[i];
		                  inX = keyData.i.x[i] === undefined ? keyData.i.x[0] : keyData.i.x[i];
		                  inY = keyData.i.y[i] === undefined ? keyData.i.y[0] : keyData.i.y[i];
		                  fnc = BezierFactory.getBezierEasing(outX, outY, inX, inY).get;
		                  keyframeMetadata.__fnct[i] = fnc;
		                } else {
		                  fnc = keyframeMetadata.__fnct[i];
		                }
		              } else if (!keyframeMetadata.__fnct) {
		                outX = keyData.o.x;
		                outY = keyData.o.y;
		                inX = keyData.i.x;
		                inY = keyData.i.y;
		                fnc = BezierFactory.getBezierEasing(outX, outY, inX, inY).get;
		                keyData.keyframeMetadata = fnc;
		              } else {
		                fnc = keyframeMetadata.__fnct;
		              }
		              perc = fnc((frameNum - keyTime) / (nextKeyTime - keyTime));
		            }
		          }

		          endValue = nextKeyData.s || keyData.e;
		          keyValue = keyData.h === 1 ? keyData.s[i] : keyData.s[i] + (endValue[i] - keyData.s[i]) * perc;

		          if (this.propType === 'multidimensional') {
		            newValue[i] = keyValue;
		          } else {
		            newValue = keyValue;
		          }
		        }
		      }
		    }
		    caching.lastIndex = iterationIndex;
		    return newValue;
		  }

		  // based on @Toji's https://github.com/toji/gl-matrix/
		  function slerp(a, b, t) {
		    var out = [];
		    var ax = a[0];
		    var ay = a[1];
		    var az = a[2];
		    var aw = a[3];
		    var bx = b[0];
		    var by = b[1];
		    var bz = b[2];
		    var bw = b[3];

		    var omega;
		    var cosom;
		    var sinom;
		    var scale0;
		    var scale1;

		    cosom = ax * bx + ay * by + az * bz + aw * bw;
		    if (cosom < 0.0) {
		      cosom = -cosom;
		      bx = -bx;
		      by = -by;
		      bz = -bz;
		      bw = -bw;
		    }
		    if ((1.0 - cosom) > 0.000001) {
		      omega = Math.acos(cosom);
		      sinom = Math.sin(omega);
		      scale0 = Math.sin((1.0 - t) * omega) / sinom;
		      scale1 = Math.sin(t * omega) / sinom;
		    } else {
		      scale0 = 1.0 - t;
		      scale1 = t;
		    }
		    out[0] = scale0 * ax + scale1 * bx;
		    out[1] = scale0 * ay + scale1 * by;
		    out[2] = scale0 * az + scale1 * bz;
		    out[3] = scale0 * aw + scale1 * bw;

		    return out;
		  }

		  function quaternionToEuler(out, quat) {
		    var qx = quat[0];
		    var qy = quat[1];
		    var qz = quat[2];
		    var qw = quat[3];
		    var heading = Math.atan2(2 * qy * qw - 2 * qx * qz, 1 - 2 * qy * qy - 2 * qz * qz);
		    var attitude = Math.asin(2 * qx * qy + 2 * qz * qw);
		    var bank = Math.atan2(2 * qx * qw - 2 * qy * qz, 1 - 2 * qx * qx - 2 * qz * qz);
		    out[0] = heading / degToRads;
		    out[1] = attitude / degToRads;
		    out[2] = bank / degToRads;
		  }

		  function createQuaternion(values) {
		    var heading = values[0] * degToRads;
		    var attitude = values[1] * degToRads;
		    var bank = values[2] * degToRads;
		    var c1 = Math.cos(heading / 2);
		    var c2 = Math.cos(attitude / 2);
		    var c3 = Math.cos(bank / 2);
		    var s1 = Math.sin(heading / 2);
		    var s2 = Math.sin(attitude / 2);
		    var s3 = Math.sin(bank / 2);
		    var w = c1 * c2 * c3 - s1 * s2 * s3;
		    var x = s1 * s2 * c3 + c1 * c2 * s3;
		    var y = s1 * c2 * c3 + c1 * s2 * s3;
		    var z = c1 * s2 * c3 - s1 * c2 * s3;

		    return [x, y, z, w];
		  }

		  function getValueAtCurrentTime() {
		    var frameNum = this.comp.renderedFrame - this.offsetTime;
		    var initTime = this.keyframes[0].t - this.offsetTime;
		    var endTime = this.keyframes[this.keyframes.length - 1].t - this.offsetTime;
		    if (!(frameNum === this._caching.lastFrame || (this._caching.lastFrame !== initFrame && ((this._caching.lastFrame >= endTime && frameNum >= endTime) || (this._caching.lastFrame < initTime && frameNum < initTime))))) {
		      if (this._caching.lastFrame >= frameNum) {
		        this._caching._lastKeyframeIndex = -1;
		        this._caching.lastIndex = 0;
		      }

		      var renderResult = this.interpolateValue(frameNum, this._caching);
		      this.pv = renderResult;
		    }
		    this._caching.lastFrame = frameNum;
		    return this.pv;
		  }

		  function setVValue(val) {
		    var multipliedValue;
		    if (this.propType === 'unidimensional') {
		      multipliedValue = val * this.mult;
		      if (mathAbs(this.v - multipliedValue) > 0.00001) {
		        this.v = multipliedValue;
		        this._mdf = true;
		      }
		    } else {
		      var i = 0;
		      var len = this.v.length;
		      while (i < len) {
		        multipliedValue = val[i] * this.mult;
		        if (mathAbs(this.v[i] - multipliedValue) > 0.00001) {
		          this.v[i] = multipliedValue;
		          this._mdf = true;
		        }
		        i += 1;
		      }
		    }
		  }

		  function processEffectsSequence() {
		    if (this.elem.globalData.frameId === this.frameId || !this.effectsSequence.length) {
		      return;
		    }
		    if (this.lock) {
		      this.setVValue(this.pv);
		      return;
		    }
		    this.lock = true;
		    this._mdf = this._isFirstFrame;
		    var i;
		    var len = this.effectsSequence.length;
		    var finalValue = this.kf ? this.pv : this.data.k;
		    for (i = 0; i < len; i += 1) {
		      finalValue = this.effectsSequence[i](finalValue);
		    }
		    this.setVValue(finalValue);
		    this._isFirstFrame = false;
		    this.lock = false;
		    this.frameId = this.elem.globalData.frameId;
		  }

		  function addEffect(effectFunction) {
		    this.effectsSequence.push(effectFunction);
		    this.container.addDynamicProperty(this);
		  }

		  function ValueProperty(elem, data, mult, container) {
		    this.propType = 'unidimensional';
		    this.mult = mult || 1;
		    this.data = data;
		    this.v = mult ? data.k * mult : data.k;
		    this.pv = data.k;
		    this._mdf = false;
		    this.elem = elem;
		    this.container = container;
		    this.comp = elem.comp;
		    this.k = false;
		    this.kf = false;
		    this.vel = 0;
		    this.effectsSequence = [];
		    this._isFirstFrame = true;
		    this.getValue = processEffectsSequence;
		    this.setVValue = setVValue;
		    this.addEffect = addEffect;
		  }

		  function MultiDimensionalProperty(elem, data, mult, container) {
		    this.propType = 'multidimensional';
		    this.mult = mult || 1;
		    this.data = data;
		    this._mdf = false;
		    this.elem = elem;
		    this.container = container;
		    this.comp = elem.comp;
		    this.k = false;
		    this.kf = false;
		    this.frameId = -1;
		    var i;
		    var len = data.k.length;
		    this.v = createTypedArray('float32', len);
		    this.pv = createTypedArray('float32', len);
		    this.vel = createTypedArray('float32', len);
		    for (i = 0; i < len; i += 1) {
		      this.v[i] = data.k[i] * this.mult;
		      this.pv[i] = data.k[i];
		    }
		    this._isFirstFrame = true;
		    this.effectsSequence = [];
		    this.getValue = processEffectsSequence;
		    this.setVValue = setVValue;
		    this.addEffect = addEffect;
		  }

		  function KeyframedValueProperty(elem, data, mult, container) {
		    this.propType = 'unidimensional';
		    this.keyframes = data.k;
		    this.keyframesMetadata = [];
		    this.offsetTime = elem.data.st;
		    this.frameId = -1;
		    this._caching = {
		      lastFrame: initFrame, lastIndex: 0, value: 0, _lastKeyframeIndex: -1,
		    };
		    this.k = true;
		    this.kf = true;
		    this.data = data;
		    this.mult = mult || 1;
		    this.elem = elem;
		    this.container = container;
		    this.comp = elem.comp;
		    this.v = initFrame;
		    this.pv = initFrame;
		    this._isFirstFrame = true;
		    this.getValue = processEffectsSequence;
		    this.setVValue = setVValue;
		    this.interpolateValue = interpolateValue;
		    this.effectsSequence = [getValueAtCurrentTime.bind(this)];
		    this.addEffect = addEffect;
		  }

		  function KeyframedMultidimensionalProperty(elem, data, mult, container) {
		    this.propType = 'multidimensional';
		    var i;
		    var len = data.k.length;
		    var s;
		    var e;
		    var to;
		    var ti;
		    for (i = 0; i < len - 1; i += 1) {
		      if (data.k[i].to && data.k[i].s && data.k[i + 1] && data.k[i + 1].s) {
		        s = data.k[i].s;
		        e = data.k[i + 1].s;
		        to = data.k[i].to;
		        ti = data.k[i].ti;
		        if ((s.length === 2 && !(s[0] === e[0] && s[1] === e[1]) && bez.pointOnLine2D(s[0], s[1], e[0], e[1], s[0] + to[0], s[1] + to[1]) && bez.pointOnLine2D(s[0], s[1], e[0], e[1], e[0] + ti[0], e[1] + ti[1])) || (s.length === 3 && !(s[0] === e[0] && s[1] === e[1] && s[2] === e[2]) && bez.pointOnLine3D(s[0], s[1], s[2], e[0], e[1], e[2], s[0] + to[0], s[1] + to[1], s[2] + to[2]) && bez.pointOnLine3D(s[0], s[1], s[2], e[0], e[1], e[2], e[0] + ti[0], e[1] + ti[1], e[2] + ti[2]))) {
		          data.k[i].to = null;
		          data.k[i].ti = null;
		        }
		        if (s[0] === e[0] && s[1] === e[1] && to[0] === 0 && to[1] === 0 && ti[0] === 0 && ti[1] === 0) {
		          if (s.length === 2 || (s[2] === e[2] && to[2] === 0 && ti[2] === 0)) {
		            data.k[i].to = null;
		            data.k[i].ti = null;
		          }
		        }
		      }
		    }
		    this.effectsSequence = [getValueAtCurrentTime.bind(this)];
		    this.data = data;
		    this.keyframes = data.k;
		    this.keyframesMetadata = [];
		    this.offsetTime = elem.data.st;
		    this.k = true;
		    this.kf = true;
		    this._isFirstFrame = true;
		    this.mult = mult || 1;
		    this.elem = elem;
		    this.container = container;
		    this.comp = elem.comp;
		    this.getValue = processEffectsSequence;
		    this.setVValue = setVValue;
		    this.interpolateValue = interpolateValue;
		    this.frameId = -1;
		    var arrLen = data.k[0].s.length;
		    this.v = createTypedArray('float32', arrLen);
		    this.pv = createTypedArray('float32', arrLen);
		    for (i = 0; i < arrLen; i += 1) {
		      this.v[i] = initFrame;
		      this.pv[i] = initFrame;
		    }
		    this._caching = { lastFrame: initFrame, lastIndex: 0, value: createTypedArray('float32', arrLen) };
		    this.addEffect = addEffect;
		  }

		  function getProp(elem, data, type, mult, container) {
		    var p;
		    if (!data.k.length) {
		      p = new ValueProperty(elem, data, mult, container);
		    } else if (typeof (data.k[0]) === 'number') {
		      p = new MultiDimensionalProperty(elem, data, mult, container);
		    } else {
		      switch (type) {
		        case 0:
		          p = new KeyframedValueProperty(elem, data, mult, container);
		          break;
		        case 1:
		          p = new KeyframedMultidimensionalProperty(elem, data, mult, container);
		          break;
		      }
		    }
		    if (p.effectsSequence.length) {
		      container.addDynamicProperty(p);
		    }
		    return p;
		  }

		  var ob = {
		    getProp: getProp,
		  };
		  return ob;
		}());

		/* global Matrix, degToRads, PropertyFactory, extendPrototype, DynamicPropertyContainer */
		/* exported TransformPropertyFactory */

		var TransformPropertyFactory = (function () {
		  var defaultVector = [0, 0];

		  function applyToMatrix(mat) {
		    var _mdf = this._mdf;
		    this.iterateDynamicProperties();
		    this._mdf = this._mdf || _mdf;
		    if (this.a) {
		      mat.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]);
		    }
		    if (this.s) {
		      mat.scale(this.s.v[0], this.s.v[1], this.s.v[2]);
		    }
		    if (this.sk) {
		      mat.skewFromAxis(-this.sk.v, this.sa.v);
		    }
		    if (this.r) {
		      mat.rotate(-this.r.v);
		    } else {
		      mat.rotateZ(-this.rz.v).rotateY(this.ry.v).rotateX(this.rx.v).rotateZ(-this.or.v[2])
		        .rotateY(this.or.v[1])
		        .rotateX(this.or.v[0]);
		    }
		    if (this.data.p.s) {
		      if (this.data.p.z) {
		        mat.translate(this.px.v, this.py.v, -this.pz.v);
		      } else {
		        mat.translate(this.px.v, this.py.v, 0);
		      }
		    } else {
		      mat.translate(this.p.v[0], this.p.v[1], -this.p.v[2]);
		    }
		  }
		  function processKeys(forceRender) {
		    if (this.elem.globalData.frameId === this.frameId) {
		      return;
		    }
		    if (this._isDirty) {
		      this.precalculateMatrix();
		      this._isDirty = false;
		    }

		    this.iterateDynamicProperties();

		    if (this._mdf || forceRender) {
		      var frameRate;
		      this.v.cloneFromProps(this.pre.props);
		      if (this.appliedTransformations < 1) {
		        this.v.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]);
		      }
		      if (this.appliedTransformations < 2) {
		        this.v.scale(this.s.v[0], this.s.v[1], this.s.v[2]);
		      }
		      if (this.sk && this.appliedTransformations < 3) {
		        this.v.skewFromAxis(-this.sk.v, this.sa.v);
		      }
		      if (this.r && this.appliedTransformations < 4) {
		        this.v.rotate(-this.r.v);
		      } else if (!this.r && this.appliedTransformations < 4) {
		        this.v.rotateZ(-this.rz.v).rotateY(this.ry.v).rotateX(this.rx.v).rotateZ(-this.or.v[2])
		          .rotateY(this.or.v[1])
		          .rotateX(this.or.v[0]);
		      }
		      if (this.autoOriented) {
		        var v1;
		        var v2;
		        frameRate = this.elem.globalData.frameRate;
		        if (this.p && this.p.keyframes && this.p.getValueAtTime) {
		          if (this.p._caching.lastFrame + this.p.offsetTime <= this.p.keyframes[0].t) {
		            v1 = this.p.getValueAtTime((this.p.keyframes[0].t + 0.01) / frameRate, 0);
		            v2 = this.p.getValueAtTime(this.p.keyframes[0].t / frameRate, 0);
		          } else if (this.p._caching.lastFrame + this.p.offsetTime >= this.p.keyframes[this.p.keyframes.length - 1].t) {
		            v1 = this.p.getValueAtTime((this.p.keyframes[this.p.keyframes.length - 1].t / frameRate), 0);
		            v2 = this.p.getValueAtTime((this.p.keyframes[this.p.keyframes.length - 1].t - 0.05) / frameRate, 0);
		          } else {
		            v1 = this.p.pv;
		            v2 = this.p.getValueAtTime((this.p._caching.lastFrame + this.p.offsetTime - 0.01) / frameRate, this.p.offsetTime);
		          }
		        } else if (this.px && this.px.keyframes && this.py.keyframes && this.px.getValueAtTime && this.py.getValueAtTime) {
		          v1 = [];
		          v2 = [];
		          var px = this.px;
		          var py = this.py;
		          if (px._caching.lastFrame + px.offsetTime <= px.keyframes[0].t) {
		            v1[0] = px.getValueAtTime((px.keyframes[0].t + 0.01) / frameRate, 0);
		            v1[1] = py.getValueAtTime((py.keyframes[0].t + 0.01) / frameRate, 0);
		            v2[0] = px.getValueAtTime((px.keyframes[0].t) / frameRate, 0);
		            v2[1] = py.getValueAtTime((py.keyframes[0].t) / frameRate, 0);
		          } else if (px._caching.lastFrame + px.offsetTime >= px.keyframes[px.keyframes.length - 1].t) {
		            v1[0] = px.getValueAtTime((px.keyframes[px.keyframes.length - 1].t / frameRate), 0);
		            v1[1] = py.getValueAtTime((py.keyframes[py.keyframes.length - 1].t / frameRate), 0);
		            v2[0] = px.getValueAtTime((px.keyframes[px.keyframes.length - 1].t - 0.01) / frameRate, 0);
		            v2[1] = py.getValueAtTime((py.keyframes[py.keyframes.length - 1].t - 0.01) / frameRate, 0);
		          } else {
		            v1 = [px.pv, py.pv];
		            v2[0] = px.getValueAtTime((px._caching.lastFrame + px.offsetTime - 0.01) / frameRate, px.offsetTime);
		            v2[1] = py.getValueAtTime((py._caching.lastFrame + py.offsetTime - 0.01) / frameRate, py.offsetTime);
		          }
		        } else {
		          v2 = defaultVector;
		          v1 = v2;
		        }
		        this.v.rotate(-Math.atan2(v1[1] - v2[1], v1[0] - v2[0]));
		      }
		      if (this.data.p && this.data.p.s) {
		        if (this.data.p.z) {
		          this.v.translate(this.px.v, this.py.v, -this.pz.v);
		        } else {
		          this.v.translate(this.px.v, this.py.v, 0);
		        }
		      } else {
		        this.v.translate(this.p.v[0], this.p.v[1], -this.p.v[2]);
		      }
		    }
		    this.frameId = this.elem.globalData.frameId;
		  }

		  function precalculateMatrix() {
		    if (!this.a.k) {
		      this.pre.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]);
		      this.appliedTransformations = 1;
		    } else {
		      return;
		    }
		    if (!this.s.effectsSequence.length) {
		      this.pre.scale(this.s.v[0], this.s.v[1], this.s.v[2]);
		      this.appliedTransformations = 2;
		    } else {
		      return;
		    }
		    if (this.sk) {
		      if (!this.sk.effectsSequence.length && !this.sa.effectsSequence.length) {
		        this.pre.skewFromAxis(-this.sk.v, this.sa.v);
		        this.appliedTransformations = 3;
		      } else {
		        return;
		      }
		    }
		    if (this.r) {
		      if (!this.r.effectsSequence.length) {
		        this.pre.rotate(-this.r.v);
		        this.appliedTransformations = 4;
		      }
		    } else if (!this.rz.effectsSequence.length && !this.ry.effectsSequence.length && !this.rx.effectsSequence.length && !this.or.effectsSequence.length) {
		      this.pre.rotateZ(-this.rz.v).rotateY(this.ry.v).rotateX(this.rx.v).rotateZ(-this.or.v[2])
		        .rotateY(this.or.v[1])
		        .rotateX(this.or.v[0]);
		      this.appliedTransformations = 4;
		    }
		  }

		  function autoOrient() {
		    //
		    // var prevP = this.getValueAtTime();
		  }

		  function addDynamicProperty(prop) {
		    this._addDynamicProperty(prop);
		    this.elem.addDynamicProperty(prop);
		    this._isDirty = true;
		  }

		  function TransformProperty(elem, data, container) {
		    this.elem = elem;
		    this.frameId = -1;
		    this.propType = 'transform';
		    this.data = data;
		    this.v = new Matrix();
		    // Precalculated matrix with non animated properties
		    this.pre = new Matrix();
		    this.appliedTransformations = 0;
		    this.initDynamicPropertyContainer(container || elem);
		    if (data.p && data.p.s) {
		      this.px = PropertyFactory.getProp(elem, data.p.x, 0, 0, this);
		      this.py = PropertyFactory.getProp(elem, data.p.y, 0, 0, this);
		      if (data.p.z) {
		        this.pz = PropertyFactory.getProp(elem, data.p.z, 0, 0, this);
		      }
		    } else {
		      this.p = PropertyFactory.getProp(elem, data.p || { k: [0, 0, 0] }, 1, 0, this);
		    }
		    if (data.rx) {
		      this.rx = PropertyFactory.getProp(elem, data.rx, 0, degToRads, this);
		      this.ry = PropertyFactory.getProp(elem, data.ry, 0, degToRads, this);
		      this.rz = PropertyFactory.getProp(elem, data.rz, 0, degToRads, this);
		      if (data.or.k[0].ti) {
		        var i;
		        var len = data.or.k.length;
		        for (i = 0; i < len; i += 1) {
		          data.or.k[i].to = null;
		          data.or.k[i].ti = null;
		        }
		      }
		      this.or = PropertyFactory.getProp(elem, data.or, 1, degToRads, this);
		      // sh Indicates it needs to be capped between -180 and 180
		      this.or.sh = true;
		    } else {
		      this.r = PropertyFactory.getProp(elem, data.r || { k: 0 }, 0, degToRads, this);
		    }
		    if (data.sk) {
		      this.sk = PropertyFactory.getProp(elem, data.sk, 0, degToRads, this);
		      this.sa = PropertyFactory.getProp(elem, data.sa, 0, degToRads, this);
		    }
		    this.a = PropertyFactory.getProp(elem, data.a || { k: [0, 0, 0] }, 1, 0, this);
		    this.s = PropertyFactory.getProp(elem, data.s || { k: [100, 100, 100] }, 1, 0.01, this);
		    // Opacity is not part of the transform properties, that's why it won't use this.dynamicProperties. That way transforms won't get updated if opacity changes.
		    if (data.o) {
		      this.o = PropertyFactory.getProp(elem, data.o, 0, 0.01, elem);
		    } else {
		      this.o = { _mdf: false, v: 1 };
		    }
		    this._isDirty = true;
		    if (!this.dynamicProperties.length) {
		      this.getValue(true);
		    }
		  }

		  TransformProperty.prototype = {
		    applyToMatrix: applyToMatrix,
		    getValue: processKeys,
		    precalculateMatrix: precalculateMatrix,
		    autoOrient: autoOrient,
		  };

		  extendPrototype([DynamicPropertyContainer], TransformProperty);
		  TransformProperty.prototype.addDynamicProperty = addDynamicProperty;
		  TransformProperty.prototype._addDynamicProperty = DynamicPropertyContainer.prototype.addDynamicProperty;

		  function getTransformProperty(elem, data, container) {
		    return new TransformProperty(elem, data, container);
		  }

		  return {
		    getTransformProperty: getTransformProperty,
		  };
		}());

		/* global createSizedArray, createSizedArray, pointPool */

		function ShapePath() {
		  this.c = false;
		  this._length = 0;
		  this._maxLength = 8;
		  this.v = createSizedArray(this._maxLength);
		  this.o = createSizedArray(this._maxLength);
		  this.i = createSizedArray(this._maxLength);
		}

		ShapePath.prototype.setPathData = function (closed, len) {
		  this.c = closed;
		  this.setLength(len);
		  var i = 0;
		  while (i < len) {
		    this.v[i] = pointPool.newElement();
		    this.o[i] = pointPool.newElement();
		    this.i[i] = pointPool.newElement();
		    i += 1;
		  }
		};

		ShapePath.prototype.setLength = function (len) {
		  while (this._maxLength < len) {
		    this.doubleArrayLength();
		  }
		  this._length = len;
		};

		ShapePath.prototype.doubleArrayLength = function () {
		  this.v = this.v.concat(createSizedArray(this._maxLength));
		  this.i = this.i.concat(createSizedArray(this._maxLength));
		  this.o = this.o.concat(createSizedArray(this._maxLength));
		  this._maxLength *= 2;
		};

		ShapePath.prototype.setXYAt = function (x, y, type, pos, replace) {
		  var arr;
		  this._length = Math.max(this._length, pos + 1);
		  if (this._length >= this._maxLength) {
		    this.doubleArrayLength();
		  }
		  switch (type) {
		    case 'v':
		      arr = this.v;
		      break;
		    case 'i':
		      arr = this.i;
		      break;
		    case 'o':
		      arr = this.o;
		      break;
		    default:
		      arr = [];
		      break;
		  }
		  if (!arr[pos] || (arr[pos] && !replace)) {
		    arr[pos] = pointPool.newElement();
		  }
		  arr[pos][0] = x;
		  arr[pos][1] = y;
		};

		ShapePath.prototype.setTripleAt = function (vX, vY, oX, oY, iX, iY, pos, replace) {
		  this.setXYAt(vX, vY, 'v', pos, replace);
		  this.setXYAt(oX, oY, 'o', pos, replace);
		  this.setXYAt(iX, iY, 'i', pos, replace);
		};

		ShapePath.prototype.reverse = function () {
		  var newPath = new ShapePath();
		  newPath.setPathData(this.c, this._length);
		  var vertices = this.v;
		  var outPoints = this.o;
		  var inPoints = this.i;
		  var init = 0;
		  if (this.c) {
		    newPath.setTripleAt(vertices[0][0], vertices[0][1], inPoints[0][0], inPoints[0][1], outPoints[0][0], outPoints[0][1], 0, false);
		    init = 1;
		  }
		  var cnt = this._length - 1;
		  var len = this._length;

		  var i;
		  for (i = init; i < len; i += 1) {
		    newPath.setTripleAt(vertices[cnt][0], vertices[cnt][1], inPoints[cnt][0], inPoints[cnt][1], outPoints[cnt][0], outPoints[cnt][1], i, false);
		    cnt -= 1;
		  }
		  return newPath;
		};

		/* global extendPrototype, roundCorner, BezierFactory, shapePool, degToRads,
		  shapeCollectionPool, PropertyFactory, bmMin, DynamicPropertyContainer */
		/* exported ShapePropertyFactory */

		var ShapePropertyFactory = (function () {
		  var initFrame = -999999;

		  function interpolateShape(frameNum, previousValue, caching) {
		    var iterationIndex = caching.lastIndex;
		    var keyPropS;
		    var keyPropE;
		    var isHold;
		    var j;
		    var k;
		    var jLen;
		    var kLen;
		    var perc;
		    var vertexValue;
		    var kf = this.keyframes;
		    if (frameNum < kf[0].t - this.offsetTime) {
		      keyPropS = kf[0].s[0];
		      isHold = true;
		      iterationIndex = 0;
		    } else if (frameNum >= kf[kf.length - 1].t - this.offsetTime) {
		      keyPropS = kf[kf.length - 1].s ? kf[kf.length - 1].s[0] : kf[kf.length - 2].e[0];
		      /* if(kf[kf.length - 1].s){
		                keyPropS = kf[kf.length - 1].s[0];
		            }else{
		                keyPropS = kf[kf.length - 2].e[0];
		            } */
		      isHold = true;
		    } else {
		      var i = iterationIndex;
		      var len = kf.length - 1;
		      var flag = true;
		      var keyData;
		      var nextKeyData;
		      var keyframeMetadata;
		      while (flag) {
		        keyData = kf[i];
		        nextKeyData = kf[i + 1];
		        if ((nextKeyData.t - this.offsetTime) > frameNum) {
		          break;
		        }
		        if (i < len - 1) {
		          i += 1;
		        } else {
		          flag = false;
		        }
		      }
		      keyframeMetadata = this.keyframesMetadata[i] || {};
		      isHold = keyData.h === 1;
		      iterationIndex = i;
		      if (!isHold) {
		        if (frameNum >= nextKeyData.t - this.offsetTime) {
		          perc = 1;
		        } else if (frameNum < keyData.t - this.offsetTime) {
		          perc = 0;
		        } else {
		          var fnc;
		          if (keyframeMetadata.__fnct) {
		            fnc = keyframeMetadata.__fnct;
		          } else {
		            fnc = BezierFactory.getBezierEasing(keyData.o.x, keyData.o.y, keyData.i.x, keyData.i.y).get;
		            keyframeMetadata.__fnct = fnc;
		          }
		          perc = fnc((frameNum - (keyData.t - this.offsetTime)) / ((nextKeyData.t - this.offsetTime) - (keyData.t - this.offsetTime)));
		        }
		        keyPropE = nextKeyData.s ? nextKeyData.s[0] : keyData.e[0];
		      }
		      keyPropS = keyData.s[0];
		    }
		    jLen = previousValue._length;
		    kLen = keyPropS.i[0].length;
		    caching.lastIndex = iterationIndex;

		    for (j = 0; j < jLen; j += 1) {
		      for (k = 0; k < kLen; k += 1) {
		        vertexValue = isHold ? keyPropS.i[j][k] : keyPropS.i[j][k] + (keyPropE.i[j][k] - keyPropS.i[j][k]) * perc;
		        previousValue.i[j][k] = vertexValue;
		        vertexValue = isHold ? keyPropS.o[j][k] : keyPropS.o[j][k] + (keyPropE.o[j][k] - keyPropS.o[j][k]) * perc;
		        previousValue.o[j][k] = vertexValue;
		        vertexValue = isHold ? keyPropS.v[j][k] : keyPropS.v[j][k] + (keyPropE.v[j][k] - keyPropS.v[j][k]) * perc;
		        previousValue.v[j][k] = vertexValue;
		      }
		    }
		  }

		  function interpolateShapeCurrentTime() {
		    var frameNum = this.comp.renderedFrame - this.offsetTime;
		    var initTime = this.keyframes[0].t - this.offsetTime;
		    var endTime = this.keyframes[this.keyframes.length - 1].t - this.offsetTime;
		    var lastFrame = this._caching.lastFrame;
		    if (!(lastFrame !== initFrame && ((lastFrame < initTime && frameNum < initTime) || (lastFrame > endTime && frameNum > endTime)))) {
		      /// /
		      this._caching.lastIndex = lastFrame < frameNum ? this._caching.lastIndex : 0;
		      this.interpolateShape(frameNum, this.pv, this._caching);
		      /// /
		    }
		    this._caching.lastFrame = frameNum;
		    return this.pv;
		  }

		  function resetShape() {
		    this.paths = this.localShapeCollection;
		  }

		  function shapesEqual(shape1, shape2) {
		    if (shape1._length !== shape2._length || shape1.c !== shape2.c) {
		      return false;
		    }
		    var i;
		    var len = shape1._length;
		    for (i = 0; i < len; i += 1) {
		      if (shape1.v[i][0] !== shape2.v[i][0]
		            || shape1.v[i][1] !== shape2.v[i][1]
		            || shape1.o[i][0] !== shape2.o[i][0]
		            || shape1.o[i][1] !== shape2.o[i][1]
		            || shape1.i[i][0] !== shape2.i[i][0]
		            || shape1.i[i][1] !== shape2.i[i][1]) {
		        return false;
		      }
		    }
		    return true;
		  }

		  function setVValue(newPath) {
		    if (!shapesEqual(this.v, newPath)) {
		      this.v = shapePool.clone(newPath);
		      this.localShapeCollection.releaseShapes();
		      this.localShapeCollection.addShape(this.v);
		      this._mdf = true;
		      this.paths = this.localShapeCollection;
		    }
		  }

		  function processEffectsSequence() {
		    if (this.elem.globalData.frameId === this.frameId) {
		      return;
		    } if (!this.effectsSequence.length) {
		      this._mdf = false;
		      return;
		    }
		    if (this.lock) {
		      this.setVValue(this.pv);
		      return;
		    }
		    this.lock = true;
		    this._mdf = false;
		    var finalValue;
		    if (this.kf) {
		      finalValue = this.pv;
		    } else if (this.data.ks) {
		      finalValue = this.data.ks.k;
		    } else {
		      finalValue = this.data.pt.k;
		    }
		    var i;
		    var len = this.effectsSequence.length;
		    for (i = 0; i < len; i += 1) {
		      finalValue = this.effectsSequence[i](finalValue);
		    }
		    this.setVValue(finalValue);
		    this.lock = false;
		    this.frameId = this.elem.globalData.frameId;
		  }

		  function ShapeProperty(elem, data, type) {
		    this.propType = 'shape';
		    this.comp = elem.comp;
		    this.container = elem;
		    this.elem = elem;
		    this.data = data;
		    this.k = false;
		    this.kf = false;
		    this._mdf = false;
		    var pathData = type === 3 ? data.pt.k : data.ks.k;
		    this.v = shapePool.clone(pathData);
		    this.pv = shapePool.clone(this.v);
		    this.localShapeCollection = shapeCollectionPool.newShapeCollection();
		    this.paths = this.localShapeCollection;
		    this.paths.addShape(this.v);
		    this.reset = resetShape;
		    this.effectsSequence = [];
		  }

		  function addEffect(effectFunction) {
		    this.effectsSequence.push(effectFunction);
		    this.container.addDynamicProperty(this);
		  }

		  ShapeProperty.prototype.interpolateShape = interpolateShape;
		  ShapeProperty.prototype.getValue = processEffectsSequence;
		  ShapeProperty.prototype.setVValue = setVValue;
		  ShapeProperty.prototype.addEffect = addEffect;

		  function KeyframedShapeProperty(elem, data, type) {
		    this.propType = 'shape';
		    this.comp = elem.comp;
		    this.elem = elem;
		    this.container = elem;
		    this.offsetTime = elem.data.st;
		    this.keyframes = type === 3 ? data.pt.k : data.ks.k;
		    this.keyframesMetadata = [];
		    this.k = true;
		    this.kf = true;
		    var len = this.keyframes[0].s[0].i.length;
		    this.v = shapePool.newElement();
		    this.v.setPathData(this.keyframes[0].s[0].c, len);
		    this.pv = shapePool.clone(this.v);
		    this.localShapeCollection = shapeCollectionPool.newShapeCollection();
		    this.paths = this.localShapeCollection;
		    this.paths.addShape(this.v);
		    this.lastFrame = initFrame;
		    this.reset = resetShape;
		    this._caching = { lastFrame: initFrame, lastIndex: 0 };
		    this.effectsSequence = [interpolateShapeCurrentTime.bind(this)];
		  }
		  KeyframedShapeProperty.prototype.getValue = processEffectsSequence;
		  KeyframedShapeProperty.prototype.interpolateShape = interpolateShape;
		  KeyframedShapeProperty.prototype.setVValue = setVValue;
		  KeyframedShapeProperty.prototype.addEffect = addEffect;

		  var EllShapeProperty = (function () {
		    var cPoint = roundCorner;

		    function EllShapePropertyFactory(elem, data) {
		      /* this.v = {
		                v: createSizedArray(4),
		                i: createSizedArray(4),
		                o: createSizedArray(4),
		                c: true
		            }; */
		      this.v = shapePool.newElement();
		      this.v.setPathData(true, 4);
		      this.localShapeCollection = shapeCollectionPool.newShapeCollection();
		      this.paths = this.localShapeCollection;
		      this.localShapeCollection.addShape(this.v);
		      this.d = data.d;
		      this.elem = elem;
		      this.comp = elem.comp;
		      this.frameId = -1;
		      this.initDynamicPropertyContainer(elem);
		      this.p = PropertyFactory.getProp(elem, data.p, 1, 0, this);
		      this.s = PropertyFactory.getProp(elem, data.s, 1, 0, this);
		      if (this.dynamicProperties.length) {
		        this.k = true;
		      } else {
		        this.k = false;
		        this.convertEllToPath();
		      }
		    }

		    EllShapePropertyFactory.prototype = {
		      reset: resetShape,
		      getValue: function () {
		        if (this.elem.globalData.frameId === this.frameId) {
		          return;
		        }
		        this.frameId = this.elem.globalData.frameId;
		        this.iterateDynamicProperties();

		        if (this._mdf) {
		          this.convertEllToPath();
		        }
		      },
		      convertEllToPath: function () {
		        var p0 = this.p.v[0];
		        var p1 = this.p.v[1];
		        var s0 = this.s.v[0] / 2;
		        var s1 = this.s.v[1] / 2;
		        var _cw = this.d !== 3;
		        var _v = this.v;
		        _v.v[0][0] = p0;
		        _v.v[0][1] = p1 - s1;
		        _v.v[1][0] = _cw ? p0 + s0 : p0 - s0;
		        _v.v[1][1] = p1;
		        _v.v[2][0] = p0;
		        _v.v[2][1] = p1 + s1;
		        _v.v[3][0] = _cw ? p0 - s0 : p0 + s0;
		        _v.v[3][1] = p1;
		        _v.i[0][0] = _cw ? p0 - s0 * cPoint : p0 + s0 * cPoint;
		        _v.i[0][1] = p1 - s1;
		        _v.i[1][0] = _cw ? p0 + s0 : p0 - s0;
		        _v.i[1][1] = p1 - s1 * cPoint;
		        _v.i[2][0] = _cw ? p0 + s0 * cPoint : p0 - s0 * cPoint;
		        _v.i[2][1] = p1 + s1;
		        _v.i[3][0] = _cw ? p0 - s0 : p0 + s0;
		        _v.i[3][1] = p1 + s1 * cPoint;
		        _v.o[0][0] = _cw ? p0 + s0 * cPoint : p0 - s0 * cPoint;
		        _v.o[0][1] = p1 - s1;
		        _v.o[1][0] = _cw ? p0 + s0 : p0 - s0;
		        _v.o[1][1] = p1 + s1 * cPoint;
		        _v.o[2][0] = _cw ? p0 - s0 * cPoint : p0 + s0 * cPoint;
		        _v.o[2][1] = p1 + s1;
		        _v.o[3][0] = _cw ? p0 - s0 : p0 + s0;
		        _v.o[3][1] = p1 - s1 * cPoint;
		      },
		    };

		    extendPrototype([DynamicPropertyContainer], EllShapePropertyFactory);

		    return EllShapePropertyFactory;
		  }());

		  var StarShapeProperty = (function () {
		    function StarShapePropertyFactory(elem, data) {
		      this.v = shapePool.newElement();
		      this.v.setPathData(true, 0);
		      this.elem = elem;
		      this.comp = elem.comp;
		      this.data = data;
		      this.frameId = -1;
		      this.d = data.d;
		      this.initDynamicPropertyContainer(elem);
		      if (data.sy === 1) {
		        this.ir = PropertyFactory.getProp(elem, data.ir, 0, 0, this);
		        this.is = PropertyFactory.getProp(elem, data.is, 0, 0.01, this);
		        this.convertToPath = this.convertStarToPath;
		      } else {
		        this.convertToPath = this.convertPolygonToPath;
		      }
		      this.pt = PropertyFactory.getProp(elem, data.pt, 0, 0, this);
		      this.p = PropertyFactory.getProp(elem, data.p, 1, 0, this);
		      this.r = PropertyFactory.getProp(elem, data.r, 0, degToRads, this);
		      this.or = PropertyFactory.getProp(elem, data.or, 0, 0, this);
		      this.os = PropertyFactory.getProp(elem, data.os, 0, 0.01, this);
		      this.localShapeCollection = shapeCollectionPool.newShapeCollection();
		      this.localShapeCollection.addShape(this.v);
		      this.paths = this.localShapeCollection;
		      if (this.dynamicProperties.length) {
		        this.k = true;
		      } else {
		        this.k = false;
		        this.convertToPath();
		      }
		    }

		    StarShapePropertyFactory.prototype = {
		      reset: resetShape,
		      getValue: function () {
		        if (this.elem.globalData.frameId === this.frameId) {
		          return;
		        }
		        this.frameId = this.elem.globalData.frameId;
		        this.iterateDynamicProperties();
		        if (this._mdf) {
		          this.convertToPath();
		        }
		      },
		      convertStarToPath: function () {
		        var numPts = Math.floor(this.pt.v) * 2;
		        var angle = (Math.PI * 2) / numPts;
		        /* this.v.v.length = numPts;
		                this.v.i.length = numPts;
		                this.v.o.length = numPts; */
		        var longFlag = true;
		        var longRad = this.or.v;
		        var shortRad = this.ir.v;
		        var longRound = this.os.v;
		        var shortRound = this.is.v;
		        var longPerimSegment = (2 * Math.PI * longRad) / (numPts * 2);
		        var shortPerimSegment = (2 * Math.PI * shortRad) / (numPts * 2);
		        var i;
		        var rad;
		        var roundness;
		        var perimSegment;
		        var currentAng = -Math.PI / 2;
		        currentAng += this.r.v;
		        var dir = this.data.d === 3 ? -1 : 1;
		        this.v._length = 0;
		        for (i = 0; i < numPts; i += 1) {
		          rad = longFlag ? longRad : shortRad;
		          roundness = longFlag ? longRound : shortRound;
		          perimSegment = longFlag ? longPerimSegment : shortPerimSegment;
		          var x = rad * Math.cos(currentAng);
		          var y = rad * Math.sin(currentAng);
		          var ox = x === 0 && y === 0 ? 0 : y / Math.sqrt(x * x + y * y);
		          var oy = x === 0 && y === 0 ? 0 : -x / Math.sqrt(x * x + y * y);
		          x += +this.p.v[0];
		          y += +this.p.v[1];
		          this.v.setTripleAt(x, y, x - ox * perimSegment * roundness * dir, y - oy * perimSegment * roundness * dir, x + ox * perimSegment * roundness * dir, y + oy * perimSegment * roundness * dir, i, true);

		          /* this.v.v[i] = [x,y];
		                    this.v.i[i] = [x+ox*perimSegment*roundness*dir,y+oy*perimSegment*roundness*dir];
		                    this.v.o[i] = [x-ox*perimSegment*roundness*dir,y-oy*perimSegment*roundness*dir];
		                    this.v._length = numPts; */
		          longFlag = !longFlag;
		          currentAng += angle * dir;
		        }
		      },
		      convertPolygonToPath: function () {
		        var numPts = Math.floor(this.pt.v);
		        var angle = (Math.PI * 2) / numPts;
		        var rad = this.or.v;
		        var roundness = this.os.v;
		        var perimSegment = (2 * Math.PI * rad) / (numPts * 4);
		        var i;
		        var currentAng = -Math.PI * 0.5;
		        var dir = this.data.d === 3 ? -1 : 1;
		        currentAng += this.r.v;
		        this.v._length = 0;
		        for (i = 0; i < numPts; i += 1) {
		          var x = rad * Math.cos(currentAng);
		          var y = rad * Math.sin(currentAng);
		          var ox = x === 0 && y === 0 ? 0 : y / Math.sqrt(x * x + y * y);
		          var oy = x === 0 && y === 0 ? 0 : -x / Math.sqrt(x * x + y * y);
		          x += +this.p.v[0];
		          y += +this.p.v[1];
		          this.v.setTripleAt(x, y, x - ox * perimSegment * roundness * dir, y - oy * perimSegment * roundness * dir, x + ox * perimSegment * roundness * dir, y + oy * perimSegment * roundness * dir, i, true);
		          currentAng += angle * dir;
		        }
		        this.paths.length = 0;
		        this.paths[0] = this.v;
		      },

		    };
		    extendPrototype([DynamicPropertyContainer], StarShapePropertyFactory);

		    return StarShapePropertyFactory;
		  }());

		  var RectShapeProperty = (function () {
		    function RectShapePropertyFactory(elem, data) {
		      this.v = shapePool.newElement();
		      this.v.c = true;
		      this.localShapeCollection = shapeCollectionPool.newShapeCollection();
		      this.localShapeCollection.addShape(this.v);
		      this.paths = this.localShapeCollection;
		      this.elem = elem;
		      this.comp = elem.comp;
		      this.frameId = -1;
		      this.d = data.d;
		      this.initDynamicPropertyContainer(elem);
		      this.p = PropertyFactory.getProp(elem, data.p, 1, 0, this);
		      this.s = PropertyFactory.getProp(elem, data.s, 1, 0, this);
		      this.r = PropertyFactory.getProp(elem, data.r, 0, 0, this);
		      if (this.dynamicProperties.length) {
		        this.k = true;
		      } else {
		        this.k = false;
		        this.convertRectToPath();
		      }
		    }

		    RectShapePropertyFactory.prototype = {
		      convertRectToPath: function () {
		        var p0 = this.p.v[0];
		        var p1 = this.p.v[1];
		        var v0 = this.s.v[0] / 2;
		        var v1 = this.s.v[1] / 2;
		        var round = bmMin(v0, v1, this.r.v);
		        var cPoint = round * (1 - roundCorner);
		        this.v._length = 0;

		        if (this.d === 2 || this.d === 1) {
		          this.v.setTripleAt(p0 + v0, p1 - v1 + round, p0 + v0, p1 - v1 + round, p0 + v0, p1 - v1 + cPoint, 0, true);
		          this.v.setTripleAt(p0 + v0, p1 + v1 - round, p0 + v0, p1 + v1 - cPoint, p0 + v0, p1 + v1 - round, 1, true);
		          if (round !== 0) {
		            this.v.setTripleAt(p0 + v0 - round, p1 + v1, p0 + v0 - round, p1 + v1, p0 + v0 - cPoint, p1 + v1, 2, true);
		            this.v.setTripleAt(p0 - v0 + round, p1 + v1, p0 - v0 + cPoint, p1 + v1, p0 - v0 + round, p1 + v1, 3, true);
		            this.v.setTripleAt(p0 - v0, p1 + v1 - round, p0 - v0, p1 + v1 - round, p0 - v0, p1 + v1 - cPoint, 4, true);
		            this.v.setTripleAt(p0 - v0, p1 - v1 + round, p0 - v0, p1 - v1 + cPoint, p0 - v0, p1 - v1 + round, 5, true);
		            this.v.setTripleAt(p0 - v0 + round, p1 - v1, p0 - v0 + round, p1 - v1, p0 - v0 + cPoint, p1 - v1, 6, true);
		            this.v.setTripleAt(p0 + v0 - round, p1 - v1, p0 + v0 - cPoint, p1 - v1, p0 + v0 - round, p1 - v1, 7, true);
		          } else {
		            this.v.setTripleAt(p0 - v0, p1 + v1, p0 - v0 + cPoint, p1 + v1, p0 - v0, p1 + v1, 2);
		            this.v.setTripleAt(p0 - v0, p1 - v1, p0 - v0, p1 - v1 + cPoint, p0 - v0, p1 - v1, 3);
		          }
		        } else {
		          this.v.setTripleAt(p0 + v0, p1 - v1 + round, p0 + v0, p1 - v1 + cPoint, p0 + v0, p1 - v1 + round, 0, true);
		          if (round !== 0) {
		            this.v.setTripleAt(p0 + v0 - round, p1 - v1, p0 + v0 - round, p1 - v1, p0 + v0 - cPoint, p1 - v1, 1, true);
		            this.v.setTripleAt(p0 - v0 + round, p1 - v1, p0 - v0 + cPoint, p1 - v1, p0 - v0 + round, p1 - v1, 2, true);
		            this.v.setTripleAt(p0 - v0, p1 - v1 + round, p0 - v0, p1 - v1 + round, p0 - v0, p1 - v1 + cPoint, 3, true);
		            this.v.setTripleAt(p0 - v0, p1 + v1 - round, p0 - v0, p1 + v1 - cPoint, p0 - v0, p1 + v1 - round, 4, true);
		            this.v.setTripleAt(p0 - v0 + round, p1 + v1, p0 - v0 + round, p1 + v1, p0 - v0 + cPoint, p1 + v1, 5, true);
		            this.v.setTripleAt(p0 + v0 - round, p1 + v1, p0 + v0 - cPoint, p1 + v1, p0 + v0 - round, p1 + v1, 6, true);
		            this.v.setTripleAt(p0 + v0, p1 + v1 - round, p0 + v0, p1 + v1 - round, p0 + v0, p1 + v1 - cPoint, 7, true);
		          } else {
		            this.v.setTripleAt(p0 - v0, p1 - v1, p0 - v0 + cPoint, p1 - v1, p0 - v0, p1 - v1, 1, true);
		            this.v.setTripleAt(p0 - v0, p1 + v1, p0 - v0, p1 + v1 - cPoint, p0 - v0, p1 + v1, 2, true);
		            this.v.setTripleAt(p0 + v0, p1 + v1, p0 + v0 - cPoint, p1 + v1, p0 + v0, p1 + v1, 3, true);
		          }
		        }
		      },
		      getValue: function () {
		        if (this.elem.globalData.frameId === this.frameId) {
		          return;
		        }
		        this.frameId = this.elem.globalData.frameId;
		        this.iterateDynamicProperties();
		        if (this._mdf) {
		          this.convertRectToPath();
		        }
		      },
		      reset: resetShape,
		    };
		    extendPrototype([DynamicPropertyContainer], RectShapePropertyFactory);

		    return RectShapePropertyFactory;
		  }());

		  function getShapeProp(elem, data, type) {
		    var prop;
		    if (type === 3 || type === 4) {
		      var dataProp = type === 3 ? data.pt : data.ks;
		      var keys = dataProp.k;
		      if (keys.length) {
		        prop = new KeyframedShapeProperty(elem, data, type);
		      } else {
		        prop = new ShapeProperty(elem, data, type);
		      }
		    } else if (type === 5) {
		      prop = new RectShapeProperty(elem, data);
		    } else if (type === 6) {
		      prop = new EllShapeProperty(elem, data);
		    } else if (type === 7) {
		      prop = new StarShapeProperty(elem, data);
		    }
		    if (prop.k) {
		      elem.addDynamicProperty(prop);
		    }
		    return prop;
		  }

		  function getConstructorFunction() {
		    return ShapeProperty;
		  }

		  function getKeyframedConstructorFunction() {
		    return KeyframedShapeProperty;
		  }

		  var ob = {};
		  ob.getShapeProp = getShapeProp;
		  ob.getConstructorFunction = getConstructorFunction;
		  ob.getKeyframedConstructorFunction = getKeyframedConstructorFunction;
		  return ob;
		}());

		/* global shapeCollectionPool, initialDefaultFrame, extendPrototype, DynamicPropertyContainer */
		/* exported ShapeModifiers */

		var ShapeModifiers = (function () {
		  var ob = {};
		  var modifiers = {};
		  ob.registerModifier = registerModifier;
		  ob.getModifier = getModifier;

		  function registerModifier(nm, factory) {
		    if (!modifiers[nm]) {
		      modifiers[nm] = factory;
		    }
		  }

		  function getModifier(nm, elem, data) {
		    return new modifiers[nm](elem, data);
		  }

		  return ob;
		}());

		function ShapeModifier() {}
		ShapeModifier.prototype.initModifierProperties = function () {};
		ShapeModifier.prototype.addShapeToModifier = function () {};
		ShapeModifier.prototype.addShape = function (data) {
		  if (!this.closed) {
		    // Adding shape to dynamic properties. It covers the case where a shape has no effects applied, to reset it's _mdf state on every tick.
		    data.sh.container.addDynamicProperty(data.sh);
		    var shapeData = { shape: data.sh, data: data, localShapeCollection: shapeCollectionPool.newShapeCollection() };
		    this.shapes.push(shapeData);
		    this.addShapeToModifier(shapeData);
		    if (this._isAnimated) {
		      data.setAsAnimated();
		    }
		  }
		};
		ShapeModifier.prototype.init = function (elem, data) {
		  this.shapes = [];
		  this.elem = elem;
		  this.initDynamicPropertyContainer(elem);
		  this.initModifierProperties(elem, data);
		  this.frameId = initialDefaultFrame;
		  this.closed = false;
		  this.k = false;
		  if (this.dynamicProperties.length) {
		    this.k = true;
		  } else {
		    this.getValue(true);
		  }
		};
		ShapeModifier.prototype.processKeys = function () {
		  if (this.elem.globalData.frameId === this.frameId) {
		    return;
		  }
		  this.frameId = this.elem.globalData.frameId;
		  this.iterateDynamicProperties();
		};

		extendPrototype([DynamicPropertyContainer], ShapeModifier);

		/* global extendPrototype, ShapeModifier, PropertyFactory, segmentsLengthPool, bez, shapePool, ShapeModifiers */

		function TrimModifier() {
		}
		extendPrototype([ShapeModifier], TrimModifier);
		TrimModifier.prototype.initModifierProperties = function (elem, data) {
		  this.s = PropertyFactory.getProp(elem, data.s, 0, 0.01, this);
		  this.e = PropertyFactory.getProp(elem, data.e, 0, 0.01, this);
		  this.o = PropertyFactory.getProp(elem, data.o, 0, 0, this);
		  this.sValue = 0;
		  this.eValue = 0;
		  this.getValue = this.processKeys;
		  this.m = data.m;
		  this._isAnimated = !!this.s.effectsSequence.length || !!this.e.effectsSequence.length || !!this.o.effectsSequence.length;
		};

		TrimModifier.prototype.addShapeToModifier = function (shapeData) {
		  shapeData.pathsData = [];
		};

		TrimModifier.prototype.calculateShapeEdges = function (s, e, shapeLength, addedLength, totalModifierLength) {
		  var segments = [];
		  if (e <= 1) {
		    segments.push({
		      s: s,
		      e: e,
		    });
		  } else if (s >= 1) {
		    segments.push({
		      s: s - 1,
		      e: e - 1,
		    });
		  } else {
		    segments.push({
		      s: s,
		      e: 1,
		    });
		    segments.push({
		      s: 0,
		      e: e - 1,
		    });
		  }
		  var shapeSegments = [];
		  var i;
		  var len = segments.length;
		  var segmentOb;
		  for (i = 0; i < len; i += 1) {
		    segmentOb = segments[i];
		    if (!(segmentOb.e * totalModifierLength < addedLength || segmentOb.s * totalModifierLength > addedLength + shapeLength)) {
		      var shapeS;
		      var shapeE;
		      if (segmentOb.s * totalModifierLength <= addedLength) {
		        shapeS = 0;
		      } else {
		        shapeS = (segmentOb.s * totalModifierLength - addedLength) / shapeLength;
		      }
		      if (segmentOb.e * totalModifierLength >= addedLength + shapeLength) {
		        shapeE = 1;
		      } else {
		        shapeE = ((segmentOb.e * totalModifierLength - addedLength) / shapeLength);
		      }
		      shapeSegments.push([shapeS, shapeE]);
		    }
		  }
		  if (!shapeSegments.length) {
		    shapeSegments.push([0, 0]);
		  }
		  return shapeSegments;
		};

		TrimModifier.prototype.releasePathsData = function (pathsData) {
		  var i;
		  var len = pathsData.length;
		  for (i = 0; i < len; i += 1) {
		    segmentsLengthPool.release(pathsData[i]);
		  }
		  pathsData.length = 0;
		  return pathsData;
		};

		TrimModifier.prototype.processShapes = function (_isFirstFrame) {
		  var s;
		  var e;
		  if (this._mdf || _isFirstFrame) {
		    var o = (this.o.v % 360) / 360;
		    if (o < 0) {
		      o += 1;
		    }
		    if (this.s.v > 1) {
		      s = 1 + o;
		    } else if (this.s.v < 0) {
		      s = 0 + o;
		    } else {
		      s = this.s.v + o;
		    }
		    if (this.e.v > 1) {
		      e = 1 + o;
		    } else if (this.e.v < 0) {
		      e = 0 + o;
		    } else {
		      e = this.e.v + o;
		    }

		    if (s > e) {
		      var _s = s;
		      s = e;
		      e = _s;
		    }
		    s = Math.round(s * 10000) * 0.0001;
		    e = Math.round(e * 10000) * 0.0001;
		    this.sValue = s;
		    this.eValue = e;
		  } else {
		    s = this.sValue;
		    e = this.eValue;
		  }
		  var shapePaths;
		  var i;
		  var len = this.shapes.length;
		  var j;
		  var jLen;
		  var pathsData;
		  var pathData;
		  var totalShapeLength;
		  var totalModifierLength = 0;

		  if (e === s) {
		    for (i = 0; i < len; i += 1) {
		      this.shapes[i].localShapeCollection.releaseShapes();
		      this.shapes[i].shape._mdf = true;
		      this.shapes[i].shape.paths = this.shapes[i].localShapeCollection;
		      if (this._mdf) {
		        this.shapes[i].pathsData.length = 0;
		      }
		    }
		  } else if (!((e === 1 && s === 0) || (e === 0 && s === 1))) {
		    var segments = [];
		    var shapeData;
		    var localShapeCollection;
		    for (i = 0; i < len; i += 1) {
		      shapeData = this.shapes[i];
		      // if shape hasn't changed and trim properties haven't changed, cached previous path can be used
		      if (!shapeData.shape._mdf && !this._mdf && !_isFirstFrame && this.m !== 2) {
		        shapeData.shape.paths = shapeData.localShapeCollection;
		      } else {
		        shapePaths = shapeData.shape.paths;
		        jLen = shapePaths._length;
		        totalShapeLength = 0;
		        if (!shapeData.shape._mdf && shapeData.pathsData.length) {
		          totalShapeLength = shapeData.totalShapeLength;
		        } else {
		          pathsData = this.releasePathsData(shapeData.pathsData);
		          for (j = 0; j < jLen; j += 1) {
		            pathData = bez.getSegmentsLength(shapePaths.shapes[j]);
		            pathsData.push(pathData);
		            totalShapeLength += pathData.totalLength;
		          }
		          shapeData.totalShapeLength = totalShapeLength;
		          shapeData.pathsData = pathsData;
		        }

		        totalModifierLength += totalShapeLength;
		        shapeData.shape._mdf = true;
		      }
		    }
		    var shapeS = s;
		    var shapeE = e;
		    var addedLength = 0;
		    var edges;
		    for (i = len - 1; i >= 0; i -= 1) {
		      shapeData = this.shapes[i];
		      if (shapeData.shape._mdf) {
		        localShapeCollection = shapeData.localShapeCollection;
		        localShapeCollection.releaseShapes();
		        // if m === 2 means paths are trimmed individually so edges need to be found for this specific shape relative to whoel group
		        if (this.m === 2 && len > 1) {
		          edges = this.calculateShapeEdges(s, e, shapeData.totalShapeLength, addedLength, totalModifierLength);
		          addedLength += shapeData.totalShapeLength;
		        } else {
		          edges = [[shapeS, shapeE]];
		        }
		        jLen = edges.length;
		        for (j = 0; j < jLen; j += 1) {
		          shapeS = edges[j][0];
		          shapeE = edges[j][1];
		          segments.length = 0;
		          if (shapeE <= 1) {
		            segments.push({
		              s: shapeData.totalShapeLength * shapeS,
		              e: shapeData.totalShapeLength * shapeE,
		            });
		          } else if (shapeS >= 1) {
		            segments.push({
		              s: shapeData.totalShapeLength * (shapeS - 1),
		              e: shapeData.totalShapeLength * (shapeE - 1),
		            });
		          } else {
		            segments.push({
		              s: shapeData.totalShapeLength * shapeS,
		              e: shapeData.totalShapeLength,
		            });
		            segments.push({
		              s: 0,
		              e: shapeData.totalShapeLength * (shapeE - 1),
		            });
		          }
		          var newShapesData = this.addShapes(shapeData, segments[0]);
		          if (segments[0].s !== segments[0].e) {
		            if (segments.length > 1) {
		              var lastShapeInCollection = shapeData.shape.paths.shapes[shapeData.shape.paths._length - 1];
		              if (lastShapeInCollection.c) {
		                var lastShape = newShapesData.pop();
		                this.addPaths(newShapesData, localShapeCollection);
		                newShapesData = this.addShapes(shapeData, segments[1], lastShape);
		              } else {
		                this.addPaths(newShapesData, localShapeCollection);
		                newShapesData = this.addShapes(shapeData, segments[1]);
		              }
		            }
		            this.addPaths(newShapesData, localShapeCollection);
		          }
		        }
		        shapeData.shape.paths = localShapeCollection;
		      }
		    }
		  } else if (this._mdf) {
		    for (i = 0; i < len; i += 1) {
		      // Releasign Trim Cached paths data when no trim applied in case shapes are modified inbetween.
		      // Don't remove this even if it's losing cached info.
		      this.shapes[i].pathsData.length = 0;
		      this.shapes[i].shape._mdf = true;
		    }
		  }
		};

		TrimModifier.prototype.addPaths = function (newPaths, localShapeCollection) {
		  var i;
		  var len = newPaths.length;
		  for (i = 0; i < len; i += 1) {
		    localShapeCollection.addShape(newPaths[i]);
		  }
		};

		TrimModifier.prototype.addSegment = function (pt1, pt2, pt3, pt4, shapePath, pos, newShape) {
		  shapePath.setXYAt(pt2[0], pt2[1], 'o', pos);
		  shapePath.setXYAt(pt3[0], pt3[1], 'i', pos + 1);
		  if (newShape) {
		    shapePath.setXYAt(pt1[0], pt1[1], 'v', pos);
		  }
		  shapePath.setXYAt(pt4[0], pt4[1], 'v', pos + 1);
		};

		TrimModifier.prototype.addSegmentFromArray = function (points, shapePath, pos, newShape) {
		  shapePath.setXYAt(points[1], points[5], 'o', pos);
		  shapePath.setXYAt(points[2], points[6], 'i', pos + 1);
		  if (newShape) {
		    shapePath.setXYAt(points[0], points[4], 'v', pos);
		  }
		  shapePath.setXYAt(points[3], points[7], 'v', pos + 1);
		};

		TrimModifier.prototype.addShapes = function (shapeData, shapeSegment, shapePath) {
		  var pathsData = shapeData.pathsData;
		  var shapePaths = shapeData.shape.paths.shapes;
		  var i;
		  var len = shapeData.shape.paths._length;
		  var j;
		  var jLen;
		  var addedLength = 0;
		  var currentLengthData;
		  var segmentCount;
		  var lengths;
		  var segment;
		  var shapes = [];
		  var initPos;
		  var newShape = true;
		  if (!shapePath) {
		    shapePath = shapePool.newElement();
		    segmentCount = 0;
		    initPos = 0;
		  } else {
		    segmentCount = shapePath._length;
		    initPos = shapePath._length;
		  }
		  shapes.push(shapePath);
		  for (i = 0; i < len; i += 1) {
		    lengths = pathsData[i].lengths;
		    shapePath.c = shapePaths[i].c;
		    jLen = shapePaths[i].c ? lengths.length : lengths.length + 1;
		    for (j = 1; j < jLen; j += 1) {
		      currentLengthData = lengths[j - 1];
		      if (addedLength + currentLengthData.addedLength < shapeSegment.s) {
		        addedLength += currentLengthData.addedLength;
		        shapePath.c = false;
		      } else if (addedLength > shapeSegment.e) {
		        shapePath.c = false;
		        break;
		      } else {
		        if (shapeSegment.s <= addedLength && shapeSegment.e >= addedLength + currentLengthData.addedLength) {
		          this.addSegment(shapePaths[i].v[j - 1], shapePaths[i].o[j - 1], shapePaths[i].i[j], shapePaths[i].v[j], shapePath, segmentCount, newShape);
		          newShape = false;
		        } else {
		          segment = bez.getNewSegment(shapePaths[i].v[j - 1], shapePaths[i].v[j], shapePaths[i].o[j - 1], shapePaths[i].i[j], (shapeSegment.s - addedLength) / currentLengthData.addedLength, (shapeSegment.e - addedLength) / currentLengthData.addedLength, lengths[j - 1]);
		          this.addSegmentFromArray(segment, shapePath, segmentCount, newShape);
		          // this.addSegment(segment.pt1, segment.pt3, segment.pt4, segment.pt2, shapePath, segmentCount, newShape);
		          newShape = false;
		          shapePath.c = false;
		        }
		        addedLength += currentLengthData.addedLength;
		        segmentCount += 1;
		      }
		    }
		    if (shapePaths[i].c && lengths.length) {
		      currentLengthData = lengths[j - 1];
		      if (addedLength <= shapeSegment.e) {
		        var segmentLength = lengths[j - 1].addedLength;
		        if (shapeSegment.s <= addedLength && shapeSegment.e >= addedLength + segmentLength) {
		          this.addSegment(shapePaths[i].v[j - 1], shapePaths[i].o[j - 1], shapePaths[i].i[0], shapePaths[i].v[0], shapePath, segmentCount, newShape);
		          newShape = false;
		        } else {
		          segment = bez.getNewSegment(shapePaths[i].v[j - 1], shapePaths[i].v[0], shapePaths[i].o[j - 1], shapePaths[i].i[0], (shapeSegment.s - addedLength) / segmentLength, (shapeSegment.e - addedLength) / segmentLength, lengths[j - 1]);
		          this.addSegmentFromArray(segment, shapePath, segmentCount, newShape);
		          // this.addSegment(segment.pt1, segment.pt3, segment.pt4, segment.pt2, shapePath, segmentCount, newShape);
		          newShape = false;
		          shapePath.c = false;
		        }
		      } else {
		        shapePath.c = false;
		      }
		      addedLength += currentLengthData.addedLength;
		      segmentCount += 1;
		    }
		    if (shapePath._length) {
		      shapePath.setXYAt(shapePath.v[initPos][0], shapePath.v[initPos][1], 'i', initPos);
		      shapePath.setXYAt(shapePath.v[shapePath._length - 1][0], shapePath.v[shapePath._length - 1][1], 'o', shapePath._length - 1);
		    }
		    if (addedLength > shapeSegment.e) {
		      break;
		    }
		    if (i < len - 1) {
		      shapePath = shapePool.newElement();
		      newShape = true;
		      shapes.push(shapePath);
		      segmentCount = 0;
		    }
		  }
		  return shapes;
		};

		ShapeModifiers.registerModifier('tm', TrimModifier);

		/* global extendPrototype, ShapeModifier, PropertyFactory, shapePool, roundCorner, ShapeModifiers */

		function RoundCornersModifier() {}
		extendPrototype([ShapeModifier], RoundCornersModifier);
		RoundCornersModifier.prototype.initModifierProperties = function (elem, data) {
		  this.getValue = this.processKeys;
		  this.rd = PropertyFactory.getProp(elem, data.r, 0, null, this);
		  this._isAnimated = !!this.rd.effectsSequence.length;
		};

		RoundCornersModifier.prototype.processPath = function (path, round) {
		  var clonedPath = shapePool.newElement();
		  clonedPath.c = path.c;
		  var i;
		  var len = path._length;
		  var currentV;
		  var currentI;
		  var currentO;
		  var closerV;
		  var distance;
		  var newPosPerc;
		  var index = 0;
		  var vX;
		  var vY;
		  var oX;
		  var oY;
		  var iX;
		  var iY;
		  for (i = 0; i < len; i += 1) {
		    currentV = path.v[i];
		    currentO = path.o[i];
		    currentI = path.i[i];
		    if (currentV[0] === currentO[0] && currentV[1] === currentO[1] && currentV[0] === currentI[0] && currentV[1] === currentI[1]) {
		      if ((i === 0 || i === len - 1) && !path.c) {
		        clonedPath.setTripleAt(currentV[0], currentV[1], currentO[0], currentO[1], currentI[0], currentI[1], index);
		        /* clonedPath.v[index] = currentV;
		                clonedPath.o[index] = currentO;
		                clonedPath.i[index] = currentI; */
		        index += 1;
		      } else {
		        if (i === 0) {
		          closerV = path.v[len - 1];
		        } else {
		          closerV = path.v[i - 1];
		        }
		        distance = Math.sqrt(Math.pow(currentV[0] - closerV[0], 2) + Math.pow(currentV[1] - closerV[1], 2));
		        newPosPerc = distance ? Math.min(distance / 2, round) / distance : 0;
		        iX = currentV[0] + (closerV[0] - currentV[0]) * newPosPerc;
		        vX = iX;
		        iY = currentV[1] - (currentV[1] - closerV[1]) * newPosPerc;
		        vY = iY;
		        oX = vX - (vX - currentV[0]) * roundCorner;
		        oY = vY - (vY - currentV[1]) * roundCorner;
		        clonedPath.setTripleAt(vX, vY, oX, oY, iX, iY, index);
		        index += 1;

		        if (i === len - 1) {
		          closerV = path.v[0];
		        } else {
		          closerV = path.v[i + 1];
		        }
		        distance = Math.sqrt(Math.pow(currentV[0] - closerV[0], 2) + Math.pow(currentV[1] - closerV[1], 2));
		        newPosPerc = distance ? Math.min(distance / 2, round) / distance : 0;
		        oX = currentV[0] + (closerV[0] - currentV[0]) * newPosPerc;
		        vX = oX;
		        oY = currentV[1] + (closerV[1] - currentV[1]) * newPosPerc;
		        vY = oY;
		        iX = vX - (vX - currentV[0]) * roundCorner;
		        iY = vY - (vY - currentV[1]) * roundCorner;
		        clonedPath.setTripleAt(vX, vY, oX, oY, iX, iY, index);
		        index += 1;
		      }
		    } else {
		      clonedPath.setTripleAt(path.v[i][0], path.v[i][1], path.o[i][0], path.o[i][1], path.i[i][0], path.i[i][1], index);
		      index += 1;
		    }
		  }
		  return clonedPath;
		};

		RoundCornersModifier.prototype.processShapes = function (_isFirstFrame) {
		  var shapePaths;
		  var i;
		  var len = this.shapes.length;
		  var j;
		  var jLen;
		  var rd = this.rd.v;

		  if (rd !== 0) {
		    var shapeData;
		    var localShapeCollection;
		    for (i = 0; i < len; i += 1) {
		      shapeData = this.shapes[i];
		      localShapeCollection = shapeData.localShapeCollection;
		      if (!(!shapeData.shape._mdf && !this._mdf && !_isFirstFrame)) {
		        localShapeCollection.releaseShapes();
		        shapeData.shape._mdf = true;
		        shapePaths = shapeData.shape.paths.shapes;
		        jLen = shapeData.shape.paths._length;
		        for (j = 0; j < jLen; j += 1) {
		          localShapeCollection.addShape(this.processPath(shapePaths[j], rd));
		        }
		      }
		      shapeData.shape.paths = shapeData.localShapeCollection;
		    }
		  }
		  if (!this.dynamicProperties.length) {
		    this._mdf = false;
		  }
		};

		ShapeModifiers.registerModifier('rd', RoundCornersModifier);

		/* global extendPrototype, ShapeModifier, PropertyFactory, shapePool, ShapeModifiers */

		function PuckerAndBloatModifier() {}
		extendPrototype([ShapeModifier], PuckerAndBloatModifier);
		PuckerAndBloatModifier.prototype.initModifierProperties = function (elem, data) {
		  this.getValue = this.processKeys;
		  this.amount = PropertyFactory.getProp(elem, data.a, 0, null, this);
		  this._isAnimated = !!this.amount.effectsSequence.length;
		};

		PuckerAndBloatModifier.prototype.processPath = function (path, amount) {
		  var percent = amount / 100;
		  var centerPoint = [0, 0];
		  var pathLength = path._length;
		  var i = 0;
		  for (i = 0; i < pathLength; i += 1) {
		    centerPoint[0] += path.v[i][0];
		    centerPoint[1] += path.v[i][1];
		  }
		  centerPoint[0] /= pathLength;
		  centerPoint[1] /= pathLength;
		  var clonedPath = shapePool.newElement();
		  clonedPath.c = path.c;
		  var vX;
		  var vY;
		  var oX;
		  var oY;
		  var iX;
		  var iY;
		  for (i = 0; i < pathLength; i += 1) {
		    vX = path.v[i][0] + (centerPoint[0] - path.v[i][0]) * percent;
		    vY = path.v[i][1] + (centerPoint[1] - path.v[i][1]) * percent;
		    oX = path.o[i][0] + (centerPoint[0] - path.o[i][0]) * -percent;
		    oY = path.o[i][1] + (centerPoint[1] - path.o[i][1]) * -percent;
		    iX = path.i[i][0] + (centerPoint[0] - path.i[i][0]) * -percent;
		    iY = path.i[i][1] + (centerPoint[1] - path.i[i][1]) * -percent;
		    clonedPath.setTripleAt(vX, vY, oX, oY, iX, iY, i);
		  }
		  return clonedPath;
		};

		PuckerAndBloatModifier.prototype.processShapes = function (_isFirstFrame) {
		  var shapePaths;
		  var i;
		  var len = this.shapes.length;
		  var j;
		  var jLen;
		  var amount = this.amount.v;

		  if (amount !== 0) {
		    var shapeData;
		    var localShapeCollection;
		    for (i = 0; i < len; i += 1) {
		      shapeData = this.shapes[i];
		      localShapeCollection = shapeData.localShapeCollection;
		      if (!(!shapeData.shape._mdf && !this._mdf && !_isFirstFrame)) {
		        localShapeCollection.releaseShapes();
		        shapeData.shape._mdf = true;
		        shapePaths = shapeData.shape.paths.shapes;
		        jLen = shapeData.shape.paths._length;
		        for (j = 0; j < jLen; j += 1) {
		          localShapeCollection.addShape(this.processPath(shapePaths[j], amount));
		        }
		      }
		      shapeData.shape.paths = shapeData.localShapeCollection;
		    }
		  }
		  if (!this.dynamicProperties.length) {
		    this._mdf = false;
		  }
		};
		ShapeModifiers.registerModifier('pb', PuckerAndBloatModifier);

		/* global extendPrototype, ShapeModifier, TransformPropertyFactory, PropertyFactory, Matrix, ShapeModifiers */

		function RepeaterModifier() {}
		extendPrototype([ShapeModifier], RepeaterModifier);

		RepeaterModifier.prototype.initModifierProperties = function (elem, data) {
		  this.getValue = this.processKeys;
		  this.c = PropertyFactory.getProp(elem, data.c, 0, null, this);
		  this.o = PropertyFactory.getProp(elem, data.o, 0, null, this);
		  this.tr = TransformPropertyFactory.getTransformProperty(elem, data.tr, this);
		  this.so = PropertyFactory.getProp(elem, data.tr.so, 0, 0.01, this);
		  this.eo = PropertyFactory.getProp(elem, data.tr.eo, 0, 0.01, this);
		  this.data = data;
		  if (!this.dynamicProperties.length) {
		    this.getValue(true);
		  }
		  this._isAnimated = !!this.dynamicProperties.length;
		  this.pMatrix = new Matrix();
		  this.rMatrix = new Matrix();
		  this.sMatrix = new Matrix();
		  this.tMatrix = new Matrix();
		  this.matrix = new Matrix();
		};

		RepeaterModifier.prototype.applyTransforms = function (pMatrix, rMatrix, sMatrix, transform, perc, inv) {
		  var dir = inv ? -1 : 1;
		  var scaleX = transform.s.v[0] + (1 - transform.s.v[0]) * (1 - perc);
		  var scaleY = transform.s.v[1] + (1 - transform.s.v[1]) * (1 - perc);
		  pMatrix.translate(transform.p.v[0] * dir * perc, transform.p.v[1] * dir * perc, transform.p.v[2]);
		  rMatrix.translate(-transform.a.v[0], -transform.a.v[1], transform.a.v[2]);
		  rMatrix.rotate(-transform.r.v * dir * perc);
		  rMatrix.translate(transform.a.v[0], transform.a.v[1], transform.a.v[2]);
		  sMatrix.translate(-transform.a.v[0], -transform.a.v[1], transform.a.v[2]);
		  sMatrix.scale(inv ? 1 / scaleX : scaleX, inv ? 1 / scaleY : scaleY);
		  sMatrix.translate(transform.a.v[0], transform.a.v[1], transform.a.v[2]);
		};

		RepeaterModifier.prototype.init = function (elem, arr, pos, elemsData) {
		  this.elem = elem;
		  this.arr = arr;
		  this.pos = pos;
		  this.elemsData = elemsData;
		  this._currentCopies = 0;
		  this._elements = [];
		  this._groups = [];
		  this.frameId = -1;
		  this.initDynamicPropertyContainer(elem);
		  this.initModifierProperties(elem, arr[pos]);
		  while (pos > 0) {
		    pos -= 1;
		    // this._elements.unshift(arr.splice(pos,1)[0]);
		    this._elements.unshift(arr[pos]);
		  }
		  if (this.dynamicProperties.length) {
		    this.k = true;
		  } else {
		    this.getValue(true);
		  }
		};

		RepeaterModifier.prototype.resetElements = function (elements) {
		  var i;
		  var len = elements.length;
		  for (i = 0; i < len; i += 1) {
		    elements[i]._processed = false;
		    if (elements[i].ty === 'gr') {
		      this.resetElements(elements[i].it);
		    }
		  }
		};

		RepeaterModifier.prototype.cloneElements = function (elements) {
		  var newElements = JSON.parse(JSON.stringify(elements));
		  this.resetElements(newElements);
		  return newElements;
		};

		RepeaterModifier.prototype.changeGroupRender = function (elements, renderFlag) {
		  var i;
		  var len = elements.length;
		  for (i = 0; i < len; i += 1) {
		    elements[i]._render = renderFlag;
		    if (elements[i].ty === 'gr') {
		      this.changeGroupRender(elements[i].it, renderFlag);
		    }
		  }
		};

		RepeaterModifier.prototype.processShapes = function (_isFirstFrame) {
		  var items;
		  var itemsTransform;
		  var i;
		  var dir;
		  var cont;
		  var hasReloaded = false;
		  if (this._mdf || _isFirstFrame) {
		    var copies = Math.ceil(this.c.v);
		    if (this._groups.length < copies) {
		      while (this._groups.length < copies) {
		        var group = {
		          it: this.cloneElements(this._elements),
		          ty: 'gr',
		        };
		        group.it.push({
		          a: { a: 0, ix: 1, k: [0, 0] }, nm: 'Transform', o: { a: 0, ix: 7, k: 100 }, p: { a: 0, ix: 2, k: [0, 0] }, r: { a: 1, ix: 6, k: [{ s: 0, e: 0, t: 0 }, { s: 0, e: 0, t: 1 }] }, s: { a: 0, ix: 3, k: [100, 100] }, sa: { a: 0, ix: 5, k: 0 }, sk: { a: 0, ix: 4, k: 0 }, ty: 'tr',
		        });

		        this.arr.splice(0, 0, group);
		        this._groups.splice(0, 0, group);
		        this._currentCopies += 1;
		      }
		      this.elem.reloadShapes();
		      hasReloaded = true;
		    }
		    cont = 0;
		    var renderFlag;
		    for (i = 0; i <= this._groups.length - 1; i += 1) {
		      renderFlag = cont < copies;
		      this._groups[i]._render = renderFlag;
		      this.changeGroupRender(this._groups[i].it, renderFlag);
		      if (!renderFlag) {
		        var elems = this.elemsData[i].it;
		        var transformData = elems[elems.length - 1];
		        if (transformData.transform.op.v !== 0) {
		          transformData.transform.op._mdf = true;
		          transformData.transform.op.v = 0;
		        } else {
		          transformData.transform.op._mdf = false;
		        }
		      }
		      cont += 1;
		    }

		    this._currentCopies = copies;
		    /// /

		    var offset = this.o.v;
		    var offsetModulo = offset % 1;
		    var roundOffset = offset > 0 ? Math.floor(offset) : Math.ceil(offset);
		    var pProps = this.pMatrix.props;
		    var rProps = this.rMatrix.props;
		    var sProps = this.sMatrix.props;
		    this.pMatrix.reset();
		    this.rMatrix.reset();
		    this.sMatrix.reset();
		    this.tMatrix.reset();
		    this.matrix.reset();
		    var iteration = 0;

		    if (offset > 0) {
		      while (iteration < roundOffset) {
		        this.applyTransforms(this.pMatrix, this.rMatrix, this.sMatrix, this.tr, 1, false);
		        iteration += 1;
		      }
		      if (offsetModulo) {
		        this.applyTransforms(this.pMatrix, this.rMatrix, this.sMatrix, this.tr, offsetModulo, false);
		        iteration += offsetModulo;
		      }
		    } else if (offset < 0) {
		      while (iteration > roundOffset) {
		        this.applyTransforms(this.pMatrix, this.rMatrix, this.sMatrix, this.tr, 1, true);
		        iteration -= 1;
		      }
		      if (offsetModulo) {
		        this.applyTransforms(this.pMatrix, this.rMatrix, this.sMatrix, this.tr, -offsetModulo, true);
		        iteration -= offsetModulo;
		      }
		    }
		    i = this.data.m === 1 ? 0 : this._currentCopies - 1;
		    dir = this.data.m === 1 ? 1 : -1;
		    cont = this._currentCopies;
		    var j;
		    var jLen;
		    while (cont) {
		      items = this.elemsData[i].it;
		      itemsTransform = items[items.length - 1].transform.mProps.v.props;
		      jLen = itemsTransform.length;
		      items[items.length - 1].transform.mProps._mdf = true;
		      items[items.length - 1].transform.op._mdf = true;
		      items[items.length - 1].transform.op.v = this._currentCopies === 1
		        ? this.so.v
		        : this.so.v + (this.eo.v - this.so.v) * (i / (this._currentCopies - 1));

		      if (iteration !== 0) {
		        if ((i !== 0 && dir === 1) || (i !== this._currentCopies - 1 && dir === -1)) {
		          this.applyTransforms(this.pMatrix, this.rMatrix, this.sMatrix, this.tr, 1, false);
		        }
		        this.matrix.transform(rProps[0], rProps[1], rProps[2], rProps[3], rProps[4], rProps[5], rProps[6], rProps[7], rProps[8], rProps[9], rProps[10], rProps[11], rProps[12], rProps[13], rProps[14], rProps[15]);
		        this.matrix.transform(sProps[0], sProps[1], sProps[2], sProps[3], sProps[4], sProps[5], sProps[6], sProps[7], sProps[8], sProps[9], sProps[10], sProps[11], sProps[12], sProps[13], sProps[14], sProps[15]);
		        this.matrix.transform(pProps[0], pProps[1], pProps[2], pProps[3], pProps[4], pProps[5], pProps[6], pProps[7], pProps[8], pProps[9], pProps[10], pProps[11], pProps[12], pProps[13], pProps[14], pProps[15]);

		        for (j = 0; j < jLen; j += 1) {
		          itemsTransform[j] = this.matrix.props[j];
		        }
		        this.matrix.reset();
		      } else {
		        this.matrix.reset();
		        for (j = 0; j < jLen; j += 1) {
		          itemsTransform[j] = this.matrix.props[j];
		        }
		      }
		      iteration += 1;
		      cont -= 1;
		      i += dir;
		    }
		  } else {
		    cont = this._currentCopies;
		    i = 0;
		    dir = 1;
		    while (cont) {
		      items = this.elemsData[i].it;
		      itemsTransform = items[items.length - 1].transform.mProps.v.props;
		      items[items.length - 1].transform.mProps._mdf = false;
		      items[items.length - 1].transform.op._mdf = false;
		      cont -= 1;
		      i += dir;
		    }
		  }
		  return hasReloaded;
		};

		RepeaterModifier.prototype.addShape = function () {};

		ShapeModifiers.registerModifier('rp', RepeaterModifier);

		/* global createSizedArray, shapePool */

		function ShapeCollection() {
		  this._length = 0;
		  this._maxLength = 4;
		  this.shapes = createSizedArray(this._maxLength);
		}

		ShapeCollection.prototype.addShape = function (shapeData) {
		  if (this._length === this._maxLength) {
		    this.shapes = this.shapes.concat(createSizedArray(this._maxLength));
		    this._maxLength *= 2;
		  }
		  this.shapes[this._length] = shapeData;
		  this._length += 1;
		};

		ShapeCollection.prototype.releaseShapes = function () {
		  var i;
		  for (i = 0; i < this._length; i += 1) {
		    shapePool.release(this.shapes[i]);
		  }
		  this._length = 0;
		};

		/* global createSizedArray, createTypedArray, PropertyFactory, extendPrototype, DynamicPropertyContainer */

		function DashProperty(elem, data, renderer, container) {
		  this.elem = elem;
		  this.frameId = -1;
		  this.dataProps = createSizedArray(data.length);
		  this.renderer = renderer;
		  this.k = false;
		  this.dashStr = '';
		  this.dashArray = createTypedArray('float32', data.length ? data.length - 1 : 0);
		  this.dashoffset = createTypedArray('float32', 1);
		  this.initDynamicPropertyContainer(container);
		  var i;
		  var len = data.length || 0;
		  var prop;
		  for (i = 0; i < len; i += 1) {
		    prop = PropertyFactory.getProp(elem, data[i].v, 0, 0, this);
		    this.k = prop.k || this.k;
		    this.dataProps[i] = { n: data[i].n, p: prop };
		  }
		  if (!this.k) {
		    this.getValue(true);
		  }
		  this._isAnimated = this.k;
		}

		DashProperty.prototype.getValue = function (forceRender) {
		  if (this.elem.globalData.frameId === this.frameId && !forceRender) {
		    return;
		  }
		  this.frameId = this.elem.globalData.frameId;
		  this.iterateDynamicProperties();
		  this._mdf = this._mdf || forceRender;
		  if (this._mdf) {
		    var i = 0;
		    var len = this.dataProps.length;
		    if (this.renderer === 'svg') {
		      this.dashStr = '';
		    }
		    for (i = 0; i < len; i += 1) {
		      if (this.dataProps[i].n !== 'o') {
		        if (this.renderer === 'svg') {
		          this.dashStr += ' ' + this.dataProps[i].p.v;
		        } else {
		          this.dashArray[i] = this.dataProps[i].p.v;
		        }
		      } else {
		        this.dashoffset[0] = this.dataProps[i].p.v;
		      }
		    }
		  }
		};
		extendPrototype([DynamicPropertyContainer], DashProperty);

		/* global createTypedArray, PropertyFactory, extendPrototype, DynamicPropertyContainer */
		function GradientProperty(elem, data, container) {
		  this.data = data;
		  this.c = createTypedArray('uint8c', data.p * 4);
		  var cLength = data.k.k[0].s ? (data.k.k[0].s.length - data.p * 4) : data.k.k.length - data.p * 4;
		  this.o = createTypedArray('float32', cLength);
		  this._cmdf = false;
		  this._omdf = false;
		  this._collapsable = this.checkCollapsable();
		  this._hasOpacity = cLength;
		  this.initDynamicPropertyContainer(container);
		  this.prop = PropertyFactory.getProp(elem, data.k, 1, null, this);
		  this.k = this.prop.k;
		  this.getValue(true);
		}

		GradientProperty.prototype.comparePoints = function (values, points) {
		  var i = 0;
		  var len = this.o.length / 2;
		  var diff;
		  while (i < len) {
		    diff = Math.abs(values[i * 4] - values[points * 4 + i * 2]);
		    if (diff > 0.01) {
		      return false;
		    }
		    i += 1;
		  }
		  return true;
		};

		GradientProperty.prototype.checkCollapsable = function () {
		  if (this.o.length / 2 !== this.c.length / 4) {
		    return false;
		  }
		  if (this.data.k.k[0].s) {
		    var i = 0;
		    var len = this.data.k.k.length;
		    while (i < len) {
		      if (!this.comparePoints(this.data.k.k[i].s, this.data.p)) {
		        return false;
		      }
		      i += 1;
		    }
		  } else if (!this.comparePoints(this.data.k.k, this.data.p)) {
		    return false;
		  }
		  return true;
		};

		GradientProperty.prototype.getValue = function (forceRender) {
		  this.prop.getValue();
		  this._mdf = false;
		  this._cmdf = false;
		  this._omdf = false;
		  if (this.prop._mdf || forceRender) {
		    var i;
		    var len = this.data.p * 4;
		    var mult;
		    var val;
		    for (i = 0; i < len; i += 1) {
		      mult = i % 4 === 0 ? 100 : 255;
		      val = Math.round(this.prop.v[i] * mult);
		      if (this.c[i] !== val) {
		        this.c[i] = val;
		        this._cmdf = !forceRender;
		      }
		    }
		    if (this.o.length) {
		      len = this.prop.v.length;
		      for (i = this.data.p * 4; i < len; i += 1) {
		        mult = i % 2 === 0 ? 100 : 1;
		        val = i % 2 === 0 ? Math.round(this.prop.v[i] * 100) : this.prop.v[i];
		        if (this.o[i - this.data.p * 4] !== val) {
		          this.o[i - this.data.p * 4] = val;
		          this._omdf = !forceRender;
		        }
		      }
		    }
		    this._mdf = !forceRender;
		  }
		};

		extendPrototype([DynamicPropertyContainer], GradientProperty);

		/* exported buildShapeString */

		var buildShapeString = function (pathNodes, length, closed, mat) {
		  if (length === 0) {
		    return '';
		  }
		  var _o = pathNodes.o;
		  var _i = pathNodes.i;
		  var _v = pathNodes.v;
		  var i;
		  var shapeString = ' M' + mat.applyToPointStringified(_v[0][0], _v[0][1]);
		  for (i = 1; i < length; i += 1) {
		    shapeString += ' C' + mat.applyToPointStringified(_o[i - 1][0], _o[i - 1][1]) + ' ' + mat.applyToPointStringified(_i[i][0], _i[i][1]) + ' ' + mat.applyToPointStringified(_v[i][0], _v[i][1]);
		  }
		  if (closed && length) {
		    shapeString += ' C' + mat.applyToPointStringified(_o[i - 1][0], _o[i - 1][1]) + ' ' + mat.applyToPointStringified(_i[0][0], _i[0][1]) + ' ' + mat.applyToPointStringified(_v[0][0], _v[0][1]);
		    shapeString += 'z';
		  }
		  return shapeString;
		};

		/* global Howl */
		/* exported audioControllerFactory */

		var audioControllerFactory = (function () {
		  function AudioController(audioFactory) {
		    this.audios = [];
		    this.audioFactory = audioFactory;
		    this._volume = 1;
		    this._isMuted = false;
		  }

		  AudioController.prototype = {
		    addAudio: function (audio) {
		      this.audios.push(audio);
		    },
		    pause: function () {
		      var i;
		      var len = this.audios.length;
		      for (i = 0; i < len; i += 1) {
		        this.audios[i].pause();
		      }
		    },
		    resume: function () {
		      var i;
		      var len = this.audios.length;
		      for (i = 0; i < len; i += 1) {
		        this.audios[i].resume();
		      }
		    },
		    setRate: function (rateValue) {
		      var i;
		      var len = this.audios.length;
		      for (i = 0; i < len; i += 1) {
		        this.audios[i].setRate(rateValue);
		      }
		    },
		    createAudio: function (assetPath) {
		      if (this.audioFactory) {
		        return this.audioFactory(assetPath);
		      } if (Howl) {
		        return new Howl({
		          src: [assetPath],
		        });
		      }
		      return {
		        isPlaying: false,
		        play: function () { this.isPlaying = true; },
		        seek: function () { this.isPlaying = false; },
		        playing: function () {},
		        rate: function () {},
		        setVolume: function () {},
		      };
		    },
		    setAudioFactory: function (audioFactory) {
		      this.audioFactory = audioFactory;
		    },
		    setVolume: function (value) {
		      this._volume = value;
		      this._updateVolume();
		    },
		    mute: function () {
		      this._isMuted = true;
		      this._updateVolume();
		    },
		    unmute: function () {
		      this._isMuted = false;
		      this._updateVolume();
		    },
		    getVolume: function () {
		      return this._volume;
		    },
		    _updateVolume: function () {
		      var i;
		      var len = this.audios.length;
		      for (i = 0; i < len; i += 1) {
		        this.audios[i].volume(this._volume * (this._isMuted ? 0 : 1));
		      }
		    },
		  };

		  return function () {
		    return new AudioController();
		  };
		}());

		/* global createTag, createNS, isSafari, dataManager */
		/* exported ImagePreloader */

		var ImagePreloader = (function () {
		  var proxyImage = (function () {
		    var canvas = createTag('canvas');
		    canvas.width = 1;
		    canvas.height = 1;
		    var ctx = canvas.getContext('2d');
		    ctx.fillStyle = 'rgba(0,0,0,0)';
		    ctx.fillRect(0, 0, 1, 1);
		    return canvas;
		  }());

		  function imageLoaded() {
		    this.loadedAssets += 1;
		    if (this.loadedAssets === this.totalImages && this.loadedFootagesCount === this.totalFootages) {
		      if (this.imagesLoadedCb) {
		        this.imagesLoadedCb(null);
		      }
		    }
		  }
		  function footageLoaded() {
		    this.loadedFootagesCount += 1;
		    if (this.loadedAssets === this.totalImages && this.loadedFootagesCount === this.totalFootages) {
		      if (this.imagesLoadedCb) {
		        this.imagesLoadedCb(null);
		      }
		    }
		  }

		  function getAssetsPath(assetData, assetsPath, originalPath) {
		    var path = '';
		    if (assetData.e) {
		      path = assetData.p;
		    } else if (assetsPath) {
		      var imagePath = assetData.p;
		      if (imagePath.indexOf('images/') !== -1) {
		        imagePath = imagePath.split('/')[1];
		      }
		      path = assetsPath + imagePath;
		    } else {
		      path = originalPath;
		      path += assetData.u ? assetData.u : '';
		      path += assetData.p;
		    }
		    return path;
		  }

		  function testImageLoaded(img) {
		    var _count = 0;
		    var intervalId = setInterval(function () {
		      var box = img.getBBox();
		      if (box.width || _count > 500) {
		        this._imageLoaded();
		        clearInterval(intervalId);
		      }
		      _count += 1;
		    }.bind(this), 50);
		  }

		  function createImageData(assetData) {
		    var path = getAssetsPath(assetData, this.assetsPath, this.path);
		    var img = createNS('image');
		    if (isSafari) {
		      this.testImageLoaded(img);
		    } else {
		      img.addEventListener('load', this._imageLoaded, false);
		    }
		    img.addEventListener('error', function () {
		      ob.img = proxyImage;
		      this._imageLoaded();
		    }.bind(this), false);
		    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', path);
		    if (this._elementHelper.append) {
		      this._elementHelper.append(img);
		    } else {
		      this._elementHelper.appendChild(img);
		    }
		    var ob = {
		      img: img,
		      assetData: assetData,
		    };
		    return ob;
		  }

		  function createImgData(assetData) {
		    var path = getAssetsPath(assetData, this.assetsPath, this.path);
		    var img = createTag('img');
		    img.crossOrigin = 'anonymous';
		    img.addEventListener('load', this._imageLoaded, false);
		    img.addEventListener('error', function () {
		      ob.img = proxyImage;
		      this._imageLoaded();
		    }.bind(this), false);
		    img.src = path;
		    var ob = {
		      img: img,
		      assetData: assetData,
		    };
		    return ob;
		  }

		  function createFootageData(data) {
		    var ob = {
		      assetData: data,
		    };
		    var path = getAssetsPath(data, this.assetsPath, this.path);
		    dataManager.loadData(path, function (footageData) {
		      ob.img = footageData;
		      this._footageLoaded();
		    }.bind(this), function () {
		      ob.img = {};
		      this._footageLoaded();
		    }.bind(this));
		    return ob;
		  }

		  function loadAssets(assets, cb) {
		    this.imagesLoadedCb = cb;
		    var i;
		    var len = assets.length;
		    for (i = 0; i < len; i += 1) {
		      if (!assets[i].layers) {
		        if (!assets[i].t || assets[i].t === 'seq') {
		          this.totalImages += 1;
		          this.images.push(this._createImageData(assets[i]));
		        } else if (assets[i].t === 3) {
		          this.totalFootages += 1;
		          this.images.push(this.createFootageData(assets[i]));
		        }
		      }
		    }
		  }

		  function setPath(path) {
		    this.path = path || '';
		  }

		  function setAssetsPath(path) {
		    this.assetsPath = path || '';
		  }

		  function getAsset(assetData) {
		    var i = 0;
		    var len = this.images.length;
		    while (i < len) {
		      if (this.images[i].assetData === assetData) {
		        return this.images[i].img;
		      }
		      i += 1;
		    }
		    return null;
		  }

		  function destroy() {
		    this.imagesLoadedCb = null;
		    this.images.length = 0;
		  }

		  function loadedImages() {
		    return this.totalImages === this.loadedAssets;
		  }

		  function loadedFootages() {
		    return this.totalFootages === this.loadedFootagesCount;
		  }

		  function setCacheType(type, elementHelper) {
		    if (type === 'svg') {
		      this._elementHelper = elementHelper;
		      this._createImageData = this.createImageData.bind(this);
		    } else {
		      this._createImageData = this.createImgData.bind(this);
		    }
		  }

		  function ImagePreloaderFactory() {
		    this._imageLoaded = imageLoaded.bind(this);
		    this._footageLoaded = footageLoaded.bind(this);
		    this.testImageLoaded = testImageLoaded.bind(this);
		    this.createFootageData = createFootageData.bind(this);
		    this.assetsPath = '';
		    this.path = '';
		    this.totalImages = 0;
		    this.totalFootages = 0;
		    this.loadedAssets = 0;
		    this.loadedFootagesCount = 0;
		    this.imagesLoadedCb = null;
		    this.images = [];
		  }

		  ImagePreloaderFactory.prototype = {
		    loadAssets: loadAssets,
		    setAssetsPath: setAssetsPath,
		    setPath: setPath,
		    loadedImages: loadedImages,
		    loadedFootages: loadedFootages,
		    destroy: destroy,
		    getAsset: getAsset,
		    createImgData: createImgData,
		    createImageData: createImageData,
		    imageLoaded: imageLoaded,
		    footageLoaded: footageLoaded,
		    setCacheType: setCacheType,
		  };

		  return ImagePreloaderFactory;
		}());

		/* exported featureSupport */

		var featureSupport = (function () {
		  var ob = {
		    maskType: true,
		  };
		  if (/MSIE 10/i.test(navigator.userAgent) || /MSIE 9/i.test(navigator.userAgent) || /rv:11.0/i.test(navigator.userAgent) || /Edge\/\d./i.test(navigator.userAgent)) {
		    ob.maskType = false;
		  }
		  return ob;
		}());

		/* global createNS */
		/* exported filtersFactory */

		var filtersFactory = (function () {
		  var ob = {};
		  ob.createFilter = createFilter;
		  ob.createAlphaToLuminanceFilter = createAlphaToLuminanceFilter;

		  function createFilter(filId, skipCoordinates) {
		    var fil = createNS('filter');
		    fil.setAttribute('id', filId);
		    if (skipCoordinates !== true) {
		      fil.setAttribute('filterUnits', 'objectBoundingBox');
		      fil.setAttribute('x', '0%');
		      fil.setAttribute('y', '0%');
		      fil.setAttribute('width', '100%');
		      fil.setAttribute('height', '100%');
		    }
		    return fil;
		  }

		  function createAlphaToLuminanceFilter() {
		    var feColorMatrix = createNS('feColorMatrix');
		    feColorMatrix.setAttribute('type', 'matrix');
		    feColorMatrix.setAttribute('color-interpolation-filters', 'sRGB');
		    feColorMatrix.setAttribute('values', '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 1');
		    return feColorMatrix;
		  }

		  return ob;
		}());

		/* global createSizedArray, PropertyFactory, TextAnimatorDataProperty, bez, addHueToRGB,
		  addSaturationToRGB, addBrightnessToRGB, LetterProps, Matrix, extendPrototype, DynamicPropertyContainer */

		function TextAnimatorProperty(textData, renderType, elem) {
		  this._isFirstFrame = true;
		  this._hasMaskedPath = false;
		  this._frameId = -1;
		  this._textData = textData;
		  this._renderType = renderType;
		  this._elem = elem;
		  this._animatorsData = createSizedArray(this._textData.a.length);
		  this._pathData = {};
		  this._moreOptions = {
		    alignment: {},
		  };
		  this.renderedLetters = [];
		  this.lettersChangedFlag = false;
		  this.initDynamicPropertyContainer(elem);
		}

		TextAnimatorProperty.prototype.searchProperties = function () {
		  var i;
		  var len = this._textData.a.length;
		  var animatorProps;
		  var getProp = PropertyFactory.getProp;
		  for (i = 0; i < len; i += 1) {
		    animatorProps = this._textData.a[i];
		    this._animatorsData[i] = new TextAnimatorDataProperty(this._elem, animatorProps, this);
		  }
		  if (this._textData.p && 'm' in this._textData.p) {
		    this._pathData = {
		      a: getProp(this._elem, this._textData.p.a, 0, 0, this),
		      f: getProp(this._elem, this._textData.p.f, 0, 0, this),
		      l: getProp(this._elem, this._textData.p.l, 0, 0, this),
		      r: getProp(this._elem, this._textData.p.r, 0, 0, this),
		      p: getProp(this._elem, this._textData.p.p, 0, 0, this),
		      m: this._elem.maskManager.getMaskProperty(this._textData.p.m),
		    };
		    this._hasMaskedPath = true;
		  } else {
		    this._hasMaskedPath = false;
		  }
		  this._moreOptions.alignment = getProp(this._elem, this._textData.m.a, 1, 0, this);
		};

		TextAnimatorProperty.prototype.getMeasures = function (documentData, lettersChangedFlag) {
		  this.lettersChangedFlag = lettersChangedFlag;
		  if (!this._mdf && !this._isFirstFrame && !lettersChangedFlag && (!this._hasMaskedPath || !this._pathData.m._mdf)) {
		    return;
		  }
		  this._isFirstFrame = false;
		  var alignment = this._moreOptions.alignment.v;
		  var animators = this._animatorsData;
		  var textData = this._textData;
		  var matrixHelper = this.mHelper;
		  var renderType = this._renderType;
		  var renderedLettersCount = this.renderedLetters.length;
		  var xPos;
		  var yPos;
		  var i;
		  var len;
		  var letters = documentData.l;
		  var pathInfo;
		  var currentLength;
		  var currentPoint;
		  var segmentLength;
		  var flag;
		  var pointInd;
		  var segmentInd;
		  var prevPoint;
		  var points;
		  var segments;
		  var partialLength;
		  var totalLength;
		  var perc;
		  var tanAngle;
		  var mask;
		  if (this._hasMaskedPath) {
		    mask = this._pathData.m;
		    if (!this._pathData.n || this._pathData._mdf) {
		      var paths = mask.v;
		      if (this._pathData.r.v) {
		        paths = paths.reverse();
		      }
		      // TODO: release bezier data cached from previous pathInfo: this._pathData.pi
		      pathInfo = {
		        tLength: 0,
		        segments: [],
		      };
		      len = paths._length - 1;
		      var bezierData;
		      totalLength = 0;
		      for (i = 0; i < len; i += 1) {
		        bezierData = bez.buildBezierData(paths.v[i],
		          paths.v[i + 1],
		          [paths.o[i][0] - paths.v[i][0], paths.o[i][1] - paths.v[i][1]],
		          [paths.i[i + 1][0] - paths.v[i + 1][0], paths.i[i + 1][1] - paths.v[i + 1][1]]);
		        pathInfo.tLength += bezierData.segmentLength;
		        pathInfo.segments.push(bezierData);
		        totalLength += bezierData.segmentLength;
		      }
		      i = len;
		      if (mask.v.c) {
		        bezierData = bez.buildBezierData(paths.v[i],
		          paths.v[0],
		          [paths.o[i][0] - paths.v[i][0], paths.o[i][1] - paths.v[i][1]],
		          [paths.i[0][0] - paths.v[0][0], paths.i[0][1] - paths.v[0][1]]);
		        pathInfo.tLength += bezierData.segmentLength;
		        pathInfo.segments.push(bezierData);
		        totalLength += bezierData.segmentLength;
		      }
		      this._pathData.pi = pathInfo;
		    }
		    pathInfo = this._pathData.pi;

		    currentLength = this._pathData.f.v;
		    segmentInd = 0;
		    pointInd = 1;
		    segmentLength = 0;
		    flag = true;
		    segments = pathInfo.segments;
		    if (currentLength < 0 && mask.v.c) {
		      if (pathInfo.tLength < Math.abs(currentLength)) {
		        currentLength = -Math.abs(currentLength) % pathInfo.tLength;
		      }
		      segmentInd = segments.length - 1;
		      points = segments[segmentInd].points;
		      pointInd = points.length - 1;
		      while (currentLength < 0) {
		        currentLength += points[pointInd].partialLength;
		        pointInd -= 1;
		        if (pointInd < 0) {
		          segmentInd -= 1;
		          points = segments[segmentInd].points;
		          pointInd = points.length - 1;
		        }
		      }
		    }
		    points = segments[segmentInd].points;
		    prevPoint = points[pointInd - 1];
		    currentPoint = points[pointInd];
		    partialLength = currentPoint.partialLength;
		  }

		  len = letters.length;
		  xPos = 0;
		  yPos = 0;
		  var yOff = documentData.finalSize * 1.2 * 0.714;
		  var firstLine = true;
		  var animatorProps;
		  var animatorSelector;
		  var j;
		  var jLen;
		  var letterValue;

		  jLen = animators.length;

		  var mult;
		  var ind = -1;
		  var offf;
		  var xPathPos;
		  var yPathPos;
		  var initPathPos = currentLength;
		  var initSegmentInd = segmentInd;
		  var initPointInd = pointInd;
		  var currentLine = -1;
		  var elemOpacity;
		  var sc;
		  var sw;
		  var fc;
		  var k;
		  var letterSw;
		  var letterSc;
		  var letterFc;
		  var letterM = '';
		  var letterP = this.defaultPropsArray;
		  var letterO;

		  //
		  if (documentData.j === 2 || documentData.j === 1) {
		    var animatorJustifyOffset = 0;
		    var animatorFirstCharOffset = 0;
		    var justifyOffsetMult = documentData.j === 2 ? -0.5 : -1;
		    var lastIndex = 0;
		    var isNewLine = true;

		    for (i = 0; i < len; i += 1) {
		      if (letters[i].n) {
		        if (animatorJustifyOffset) {
		          animatorJustifyOffset += animatorFirstCharOffset;
		        }
		        while (lastIndex < i) {
		          letters[lastIndex].animatorJustifyOffset = animatorJustifyOffset;
		          lastIndex += 1;
		        }
		        animatorJustifyOffset = 0;
		        isNewLine = true;
		      } else {
		        for (j = 0; j < jLen; j += 1) {
		          animatorProps = animators[j].a;
		          if (animatorProps.t.propType) {
		            if (isNewLine && documentData.j === 2) {
		              animatorFirstCharOffset += animatorProps.t.v * justifyOffsetMult;
		            }
		            animatorSelector = animators[j].s;
		            mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		            if (mult.length) {
		              animatorJustifyOffset += animatorProps.t.v * mult[0] * justifyOffsetMult;
		            } else {
		              animatorJustifyOffset += animatorProps.t.v * mult * justifyOffsetMult;
		            }
		          }
		        }
		        isNewLine = false;
		      }
		    }
		    if (animatorJustifyOffset) {
		      animatorJustifyOffset += animatorFirstCharOffset;
		    }
		    while (lastIndex < i) {
		      letters[lastIndex].animatorJustifyOffset = animatorJustifyOffset;
		      lastIndex += 1;
		    }
		  }
		  //

		  for (i = 0; i < len; i += 1) {
		    matrixHelper.reset();
		    elemOpacity = 1;
		    if (letters[i].n) {
		      xPos = 0;
		      yPos += documentData.yOffset;
		      yPos += firstLine ? 1 : 0;
		      currentLength = initPathPos;
		      firstLine = false;
		      if (this._hasMaskedPath) {
		        segmentInd = initSegmentInd;
		        pointInd = initPointInd;
		        points = segments[segmentInd].points;
		        prevPoint = points[pointInd - 1];
		        currentPoint = points[pointInd];
		        partialLength = currentPoint.partialLength;
		        segmentLength = 0;
		      }
		      letterM = '';
		      letterFc = '';
		      letterSw = '';
		      letterO = '';
		      letterP = this.defaultPropsArray;
		    } else {
		      if (this._hasMaskedPath) {
		        if (currentLine !== letters[i].line) {
		          switch (documentData.j) {
		            case 1:
		              currentLength += totalLength - documentData.lineWidths[letters[i].line];
		              break;
		            case 2:
		              currentLength += (totalLength - documentData.lineWidths[letters[i].line]) / 2;
		              break;
		          }
		          currentLine = letters[i].line;
		        }
		        if (ind !== letters[i].ind) {
		          if (letters[ind]) {
		            currentLength += letters[ind].extra;
		          }
		          currentLength += letters[i].an / 2;
		          ind = letters[i].ind;
		        }
		        currentLength += (alignment[0] * letters[i].an) * 0.005;
		        var animatorOffset = 0;
		        for (j = 0; j < jLen; j += 1) {
		          animatorProps = animators[j].a;
		          if (animatorProps.p.propType) {
		            animatorSelector = animators[j].s;
		            mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		            if (mult.length) {
		              animatorOffset += animatorProps.p.v[0] * mult[0];
		            } else {
		              animatorOffset += animatorProps.p.v[0] * mult;
		            }
		          }
		          if (animatorProps.a.propType) {
		            animatorSelector = animators[j].s;
		            mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		            if (mult.length) {
		              animatorOffset += animatorProps.a.v[0] * mult[0];
		            } else {
		              animatorOffset += animatorProps.a.v[0] * mult;
		            }
		          }
		        }
		        flag = true;
		        // Force alignment only works with a single line for now
		        if (this._pathData.a.v) {
		          currentLength = letters[0].an * 0.5 + ((totalLength - this._pathData.f.v - letters[0].an * 0.5 - letters[letters.length - 1].an * 0.5) * ind) / (len - 1);
		          currentLength += this._pathData.f.v;
		        }
		        while (flag) {
		          if (segmentLength + partialLength >= currentLength + animatorOffset || !points) {
		            perc = (currentLength + animatorOffset - segmentLength) / currentPoint.partialLength;
		            xPathPos = prevPoint.point[0] + (currentPoint.point[0] - prevPoint.point[0]) * perc;
		            yPathPos = prevPoint.point[1] + (currentPoint.point[1] - prevPoint.point[1]) * perc;
		            matrixHelper.translate((-alignment[0] * letters[i].an) * 0.005, -(alignment[1] * yOff) * 0.01);
		            flag = false;
		          } else if (points) {
		            segmentLength += currentPoint.partialLength;
		            pointInd += 1;
		            if (pointInd >= points.length) {
		              pointInd = 0;
		              segmentInd += 1;
		              if (!segments[segmentInd]) {
		                if (mask.v.c) {
		                  pointInd = 0;
		                  segmentInd = 0;
		                  points = segments[segmentInd].points;
		                } else {
		                  segmentLength -= currentPoint.partialLength;
		                  points = null;
		                }
		              } else {
		                points = segments[segmentInd].points;
		              }
		            }
		            if (points) {
		              prevPoint = currentPoint;
		              currentPoint = points[pointInd];
		              partialLength = currentPoint.partialLength;
		            }
		          }
		        }
		        offf = letters[i].an / 2 - letters[i].add;
		        matrixHelper.translate(-offf, 0, 0);
		      } else {
		        offf = letters[i].an / 2 - letters[i].add;
		        matrixHelper.translate(-offf, 0, 0);

		        // Grouping alignment
		        matrixHelper.translate((-alignment[0] * letters[i].an) * 0.005, (-alignment[1] * yOff) * 0.01, 0);
		      }

		      for (j = 0; j < jLen; j += 1) {
		        animatorProps = animators[j].a;
		        if (animatorProps.t.propType) {
		          animatorSelector = animators[j].s;
		          mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		          // This condition is to prevent applying tracking to first character in each line. Might be better to use a boolean "isNewLine"
		          if (xPos !== 0 || documentData.j !== 0) {
		            if (this._hasMaskedPath) {
		              if (mult.length) {
		                currentLength += animatorProps.t.v * mult[0];
		              } else {
		                currentLength += animatorProps.t.v * mult;
		              }
		            } else if (mult.length) {
		              xPos += animatorProps.t.v * mult[0];
		            } else {
		              xPos += animatorProps.t.v * mult;
		            }
		          }
		        }
		      }
		      if (documentData.strokeWidthAnim) {
		        sw = documentData.sw || 0;
		      }
		      if (documentData.strokeColorAnim) {
		        if (documentData.sc) {
		          sc = [documentData.sc[0], documentData.sc[1], documentData.sc[2]];
		        } else {
		          sc = [0, 0, 0];
		        }
		      }
		      if (documentData.fillColorAnim && documentData.fc) {
		        fc = [documentData.fc[0], documentData.fc[1], documentData.fc[2]];
		      }
		      for (j = 0; j < jLen; j += 1) {
		        animatorProps = animators[j].a;
		        if (animatorProps.a.propType) {
		          animatorSelector = animators[j].s;
		          mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);

		          if (mult.length) {
		            matrixHelper.translate(-animatorProps.a.v[0] * mult[0], -animatorProps.a.v[1] * mult[1], animatorProps.a.v[2] * mult[2]);
		          } else {
		            matrixHelper.translate(-animatorProps.a.v[0] * mult, -animatorProps.a.v[1] * mult, animatorProps.a.v[2] * mult);
		          }
		        }
		      }
		      for (j = 0; j < jLen; j += 1) {
		        animatorProps = animators[j].a;
		        if (animatorProps.s.propType) {
		          animatorSelector = animators[j].s;
		          mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		          if (mult.length) {
		            matrixHelper.scale(1 + ((animatorProps.s.v[0] - 1) * mult[0]), 1 + ((animatorProps.s.v[1] - 1) * mult[1]), 1);
		          } else {
		            matrixHelper.scale(1 + ((animatorProps.s.v[0] - 1) * mult), 1 + ((animatorProps.s.v[1] - 1) * mult), 1);
		          }
		        }
		      }
		      for (j = 0; j < jLen; j += 1) {
		        animatorProps = animators[j].a;
		        animatorSelector = animators[j].s;
		        mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		        if (animatorProps.sk.propType) {
		          if (mult.length) {
		            matrixHelper.skewFromAxis(-animatorProps.sk.v * mult[0], animatorProps.sa.v * mult[1]);
		          } else {
		            matrixHelper.skewFromAxis(-animatorProps.sk.v * mult, animatorProps.sa.v * mult);
		          }
		        }
		        if (animatorProps.r.propType) {
		          if (mult.length) {
		            matrixHelper.rotateZ(-animatorProps.r.v * mult[2]);
		          } else {
		            matrixHelper.rotateZ(-animatorProps.r.v * mult);
		          }
		        }
		        if (animatorProps.ry.propType) {
		          if (mult.length) {
		            matrixHelper.rotateY(animatorProps.ry.v * mult[1]);
		          } else {
		            matrixHelper.rotateY(animatorProps.ry.v * mult);
		          }
		        }
		        if (animatorProps.rx.propType) {
		          if (mult.length) {
		            matrixHelper.rotateX(animatorProps.rx.v * mult[0]);
		          } else {
		            matrixHelper.rotateX(animatorProps.rx.v * mult);
		          }
		        }
		        if (animatorProps.o.propType) {
		          if (mult.length) {
		            elemOpacity += ((animatorProps.o.v) * mult[0] - elemOpacity) * mult[0];
		          } else {
		            elemOpacity += ((animatorProps.o.v) * mult - elemOpacity) * mult;
		          }
		        }
		        if (documentData.strokeWidthAnim && animatorProps.sw.propType) {
		          if (mult.length) {
		            sw += animatorProps.sw.v * mult[0];
		          } else {
		            sw += animatorProps.sw.v * mult;
		          }
		        }
		        if (documentData.strokeColorAnim && animatorProps.sc.propType) {
		          for (k = 0; k < 3; k += 1) {
		            if (mult.length) {
		              sc[k] += (animatorProps.sc.v[k] - sc[k]) * mult[0];
		            } else {
		              sc[k] += (animatorProps.sc.v[k] - sc[k]) * mult;
		            }
		          }
		        }
		        if (documentData.fillColorAnim && documentData.fc) {
		          if (animatorProps.fc.propType) {
		            for (k = 0; k < 3; k += 1) {
		              if (mult.length) {
		                fc[k] += (animatorProps.fc.v[k] - fc[k]) * mult[0];
		              } else {
		                fc[k] += (animatorProps.fc.v[k] - fc[k]) * mult;
		              }
		            }
		          }
		          if (animatorProps.fh.propType) {
		            if (mult.length) {
		              fc = addHueToRGB(fc, animatorProps.fh.v * mult[0]);
		            } else {
		              fc = addHueToRGB(fc, animatorProps.fh.v * mult);
		            }
		          }
		          if (animatorProps.fs.propType) {
		            if (mult.length) {
		              fc = addSaturationToRGB(fc, animatorProps.fs.v * mult[0]);
		            } else {
		              fc = addSaturationToRGB(fc, animatorProps.fs.v * mult);
		            }
		          }
		          if (animatorProps.fb.propType) {
		            if (mult.length) {
		              fc = addBrightnessToRGB(fc, animatorProps.fb.v * mult[0]);
		            } else {
		              fc = addBrightnessToRGB(fc, animatorProps.fb.v * mult);
		            }
		          }
		        }
		      }

		      for (j = 0; j < jLen; j += 1) {
		        animatorProps = animators[j].a;

		        if (animatorProps.p.propType) {
		          animatorSelector = animators[j].s;
		          mult = animatorSelector.getMult(letters[i].anIndexes[j], textData.a[j].s.totalChars);
		          if (this._hasMaskedPath) {
		            if (mult.length) {
		              matrixHelper.translate(0, animatorProps.p.v[1] * mult[0], -animatorProps.p.v[2] * mult[1]);
		            } else {
		              matrixHelper.translate(0, animatorProps.p.v[1] * mult, -animatorProps.p.v[2] * mult);
		            }
		          } else if (mult.length) {
		            matrixHelper.translate(animatorProps.p.v[0] * mult[0], animatorProps.p.v[1] * mult[1], -animatorProps.p.v[2] * mult[2]);
		          } else {
		            matrixHelper.translate(animatorProps.p.v[0] * mult, animatorProps.p.v[1] * mult, -animatorProps.p.v[2] * mult);
		          }
		        }
		      }
		      if (documentData.strokeWidthAnim) {
		        letterSw = sw < 0 ? 0 : sw;
		      }
		      if (documentData.strokeColorAnim) {
		        letterSc = 'rgb(' + Math.round(sc[0] * 255) + ',' + Math.round(sc[1] * 255) + ',' + Math.round(sc[2] * 255) + ')';
		      }
		      if (documentData.fillColorAnim && documentData.fc) {
		        letterFc = 'rgb(' + Math.round(fc[0] * 255) + ',' + Math.round(fc[1] * 255) + ',' + Math.round(fc[2] * 255) + ')';
		      }

		      if (this._hasMaskedPath) {
		        matrixHelper.translate(0, -documentData.ls);

		        matrixHelper.translate(0, (alignment[1] * yOff) * 0.01 + yPos, 0);
		        if (this._pathData.p.v) {
		          tanAngle = (currentPoint.point[1] - prevPoint.point[1]) / (currentPoint.point[0] - prevPoint.point[0]);
		          var rot = (Math.atan(tanAngle) * 180) / Math.PI;
		          if (currentPoint.point[0] < prevPoint.point[0]) {
		            rot += 180;
		          }
		          matrixHelper.rotate((-rot * Math.PI) / 180);
		        }
		        matrixHelper.translate(xPathPos, yPathPos, 0);
		        currentLength -= (alignment[0] * letters[i].an) * 0.005;
		        if (letters[i + 1] && ind !== letters[i + 1].ind) {
		          currentLength += letters[i].an / 2;
		          currentLength += (documentData.tr * 0.001) * documentData.finalSize;
		        }
		      } else {
		        matrixHelper.translate(xPos, yPos, 0);

		        if (documentData.ps) {
		          // matrixHelper.translate(documentData.ps[0],documentData.ps[1],0);
		          matrixHelper.translate(documentData.ps[0], documentData.ps[1] + documentData.ascent, 0);
		        }
		        switch (documentData.j) {
		          case 1:
		            matrixHelper.translate(letters[i].animatorJustifyOffset + documentData.justifyOffset + (documentData.boxWidth - documentData.lineWidths[letters[i].line]), 0, 0);
		            break;
		          case 2:
		            matrixHelper.translate(letters[i].animatorJustifyOffset + documentData.justifyOffset + (documentData.boxWidth - documentData.lineWidths[letters[i].line]) / 2, 0, 0);
		            break;
		        }
		        matrixHelper.translate(0, -documentData.ls);
		        matrixHelper.translate(offf, 0, 0);
		        matrixHelper.translate((alignment[0] * letters[i].an) * 0.005, (alignment[1] * yOff) * 0.01, 0);
		        xPos += letters[i].l + (documentData.tr * 0.001) * documentData.finalSize;
		      }
		      if (renderType === 'html') {
		        letterM = matrixHelper.toCSS();
		      } else if (renderType === 'svg') {
		        letterM = matrixHelper.to2dCSS();
		      } else {
		        letterP = [matrixHelper.props[0], matrixHelper.props[1], matrixHelper.props[2], matrixHelper.props[3], matrixHelper.props[4], matrixHelper.props[5], matrixHelper.props[6], matrixHelper.props[7], matrixHelper.props[8], matrixHelper.props[9], matrixHelper.props[10], matrixHelper.props[11], matrixHelper.props[12], matrixHelper.props[13], matrixHelper.props[14], matrixHelper.props[15]];
		      }
		      letterO = elemOpacity;
		    }

		    if (renderedLettersCount <= i) {
		      letterValue = new LetterProps(letterO, letterSw, letterSc, letterFc, letterM, letterP);
		      this.renderedLetters.push(letterValue);
		      renderedLettersCount += 1;
		      this.lettersChangedFlag = true;
		    } else {
		      letterValue = this.renderedLetters[i];
		      this.lettersChangedFlag = letterValue.update(letterO, letterSw, letterSc, letterFc, letterM, letterP) || this.lettersChangedFlag;
		    }
		  }
		};

		TextAnimatorProperty.prototype.getValue = function () {
		  if (this._elem.globalData.frameId === this._frameId) {
		    return;
		  }
		  this._frameId = this._elem.globalData.frameId;
		  this.iterateDynamicProperties();
		};

		TextAnimatorProperty.prototype.mHelper = new Matrix();
		TextAnimatorProperty.prototype.defaultPropsArray = [];
		extendPrototype([DynamicPropertyContainer], TextAnimatorProperty);

		/* global PropertyFactory, degToRads, TextSelectorProp */
		/* exported TextAnimatorDataProperty */

		function TextAnimatorDataProperty(elem, animatorProps, container) {
		  var defaultData = { propType: false };
		  var getProp = PropertyFactory.getProp;
		  var textAnimatorAnimatables = animatorProps.a;
		  this.a = {
		    r: textAnimatorAnimatables.r ? getProp(elem, textAnimatorAnimatables.r, 0, degToRads, container) : defaultData,
		    rx: textAnimatorAnimatables.rx ? getProp(elem, textAnimatorAnimatables.rx, 0, degToRads, container) : defaultData,
		    ry: textAnimatorAnimatables.ry ? getProp(elem, textAnimatorAnimatables.ry, 0, degToRads, container) : defaultData,
		    sk: textAnimatorAnimatables.sk ? getProp(elem, textAnimatorAnimatables.sk, 0, degToRads, container) : defaultData,
		    sa: textAnimatorAnimatables.sa ? getProp(elem, textAnimatorAnimatables.sa, 0, degToRads, container) : defaultData,
		    s: textAnimatorAnimatables.s ? getProp(elem, textAnimatorAnimatables.s, 1, 0.01, container) : defaultData,
		    a: textAnimatorAnimatables.a ? getProp(elem, textAnimatorAnimatables.a, 1, 0, container) : defaultData,
		    o: textAnimatorAnimatables.o ? getProp(elem, textAnimatorAnimatables.o, 0, 0.01, container) : defaultData,
		    p: textAnimatorAnimatables.p ? getProp(elem, textAnimatorAnimatables.p, 1, 0, container) : defaultData,
		    sw: textAnimatorAnimatables.sw ? getProp(elem, textAnimatorAnimatables.sw, 0, 0, container) : defaultData,
		    sc: textAnimatorAnimatables.sc ? getProp(elem, textAnimatorAnimatables.sc, 1, 0, container) : defaultData,
		    fc: textAnimatorAnimatables.fc ? getProp(elem, textAnimatorAnimatables.fc, 1, 0, container) : defaultData,
		    fh: textAnimatorAnimatables.fh ? getProp(elem, textAnimatorAnimatables.fh, 0, 0, container) : defaultData,
		    fs: textAnimatorAnimatables.fs ? getProp(elem, textAnimatorAnimatables.fs, 0, 0.01, container) : defaultData,
		    fb: textAnimatorAnimatables.fb ? getProp(elem, textAnimatorAnimatables.fb, 0, 0.01, container) : defaultData,
		    t: textAnimatorAnimatables.t ? getProp(elem, textAnimatorAnimatables.t, 0, 0, container) : defaultData,
		  };

		  this.s = TextSelectorProp.getTextSelectorProp(elem, animatorProps.s, container);
		  this.s.t = animatorProps.s.t;
		}

		function LetterProps(o, sw, sc, fc, m, p) {
		  this.o = o;
		  this.sw = sw;
		  this.sc = sc;
		  this.fc = fc;
		  this.m = m;
		  this.p = p;
		  this._mdf = {
		    o: true,
		    sw: !!sw,
		    sc: !!sc,
		    fc: !!fc,
		    m: true,
		    p: true,
		  };
		}

		LetterProps.prototype.update = function (o, sw, sc, fc, m, p) {
		  this._mdf.o = false;
		  this._mdf.sw = false;
		  this._mdf.sc = false;
		  this._mdf.fc = false;
		  this._mdf.m = false;
		  this._mdf.p = false;
		  var updated = false;

		  if (this.o !== o) {
		    this.o = o;
		    this._mdf.o = true;
		    updated = true;
		  }
		  if (this.sw !== sw) {
		    this.sw = sw;
		    this._mdf.sw = true;
		    updated = true;
		  }
		  if (this.sc !== sc) {
		    this.sc = sc;
		    this._mdf.sc = true;
		    updated = true;
		  }
		  if (this.fc !== fc) {
		    this.fc = fc;
		    this._mdf.fc = true;
		    updated = true;
		  }
		  if (this.m !== m) {
		    this.m = m;
		    this._mdf.m = true;
		    updated = true;
		  }
		  if (p.length && (this.p[0] !== p[0] || this.p[1] !== p[1] || this.p[4] !== p[4] || this.p[5] !== p[5] || this.p[12] !== p[12] || this.p[13] !== p[13])) {
		    this.p = p;
		    this._mdf.p = true;
		    updated = true;
		  }
		  return updated;
		};

		/* global FontManager, initialDefaultFrame, getFontProperties */
		/* exported TextProperty */

		function TextProperty(elem, data) {
		  this._frameId = initialDefaultFrame;
		  this.pv = '';
		  this.v = '';
		  this.kf = false;
		  this._isFirstFrame = true;
		  this._mdf = false;
		  this.data = data;
		  this.elem = elem;
		  this.comp = this.elem.comp;
		  this.keysIndex = 0;
		  this.canResize = false;
		  this.minimumFontSize = 1;
		  this.effectsSequence = [];
		  this.currentData = {
		    ascent: 0,
		    boxWidth: this.defaultBoxWidth,
		    f: '',
		    fStyle: '',
		    fWeight: '',
		    fc: '',
		    j: '',
		    justifyOffset: '',
		    l: [],
		    lh: 0,
		    lineWidths: [],
		    ls: '',
		    of: '',
		    s: '',
		    sc: '',
		    sw: 0,
		    t: 0,
		    tr: 0,
		    sz: 0,
		    ps: null,
		    fillColorAnim: false,
		    strokeColorAnim: false,
		    strokeWidthAnim: false,
		    yOffset: 0,
		    finalSize: 0,
		    finalText: [],
		    finalLineHeight: 0,
		    __complete: false,

		  };
		  this.copyData(this.currentData, this.data.d.k[0].s);

		  if (!this.searchProperty()) {
		    this.completeTextData(this.currentData);
		  }
		}

		TextProperty.prototype.defaultBoxWidth = [0, 0];

		TextProperty.prototype.copyData = function (obj, data) {
		  for (var s in data) {
		    if (Object.prototype.hasOwnProperty.call(data, s)) {
		      obj[s] = data[s];
		    }
		  }
		  return obj;
		};

		TextProperty.prototype.setCurrentData = function (data) {
		  if (!data.__complete) {
		    this.completeTextData(data);
		  }
		  this.currentData = data;
		  this.currentData.boxWidth = this.currentData.boxWidth || this.defaultBoxWidth;
		  this._mdf = true;
		};

		TextProperty.prototype.searchProperty = function () {
		  return this.searchKeyframes();
		};

		TextProperty.prototype.searchKeyframes = function () {
		  this.kf = this.data.d.k.length > 1;
		  if (this.kf) {
		    this.addEffect(this.getKeyframeValue.bind(this));
		  }
		  return this.kf;
		};

		TextProperty.prototype.addEffect = function (effectFunction) {
		  this.effectsSequence.push(effectFunction);
		  this.elem.addDynamicProperty(this);
		};

		TextProperty.prototype.getValue = function (_finalValue) {
		  if ((this.elem.globalData.frameId === this.frameId || !this.effectsSequence.length) && !_finalValue) {
		    return;
		  }
		  this.currentData.t = this.data.d.k[this.keysIndex].s.t;
		  var currentValue = this.currentData;
		  var currentIndex = this.keysIndex;
		  if (this.lock) {
		    this.setCurrentData(this.currentData);
		    return;
		  }
		  this.lock = true;
		  this._mdf = false;
		  var i; var
		    len = this.effectsSequence.length;
		  var finalValue = _finalValue || this.data.d.k[this.keysIndex].s;
		  for (i = 0; i < len; i += 1) {
		    // Checking if index changed to prevent creating a new object every time the expression updates.
		    if (currentIndex !== this.keysIndex) {
		      finalValue = this.effectsSequence[i](finalValue, finalValue.t);
		    } else {
		      finalValue = this.effectsSequence[i](this.currentData, finalValue.t);
		    }
		  }
		  if (currentValue !== finalValue) {
		    this.setCurrentData(finalValue);
		  }
		  this.v = this.currentData;
		  this.pv = this.v;
		  this.lock = false;
		  this.frameId = this.elem.globalData.frameId;
		};

		TextProperty.prototype.getKeyframeValue = function () {
		  var textKeys = this.data.d.k;
		  var frameNum = this.elem.comp.renderedFrame;
		  var i = 0; var
		    len = textKeys.length;
		  while (i <= len - 1) {
		    if (i === len - 1 || textKeys[i + 1].t > frameNum) {
		      break;
		    }
		    i += 1;
		  }
		  if (this.keysIndex !== i) {
		    this.keysIndex = i;
		  }
		  return this.data.d.k[this.keysIndex].s;
		};

		TextProperty.prototype.buildFinalText = function (text) {
		  var charactersArray = [];
		  var i = 0;
		  var len = text.length;
		  var charCode;
		  var secondCharCode;
		  var shouldCombine = false;
		  while (i < len) {
		    charCode = text.charCodeAt(i);
		    if (FontManager.isCombinedCharacter(charCode)) {
		      charactersArray[charactersArray.length - 1] += text.charAt(i);
		    } else if (charCode >= 0xD800 && charCode <= 0xDBFF) {
		      secondCharCode = text.charCodeAt(i + 1);
		      if (secondCharCode >= 0xDC00 && secondCharCode <= 0xDFFF) {
		        if (shouldCombine || FontManager.isModifier(charCode, secondCharCode)) {
		          charactersArray[charactersArray.length - 1] += text.substr(i, 2);
		          shouldCombine = false;
		        } else {
		          charactersArray.push(text.substr(i, 2));
		        }
		        i += 1;
		      } else {
		        charactersArray.push(text.charAt(i));
		      }
		    } else if (charCode > 0xDBFF) {
		      secondCharCode = text.charCodeAt(i + 1);
		      if (FontManager.isZeroWidthJoiner(charCode, secondCharCode)) {
		        shouldCombine = true;
		        charactersArray[charactersArray.length - 1] += text.substr(i, 2);
		        i += 1;
		      } else {
		        charactersArray.push(text.charAt(i));
		      }
		    } else if (FontManager.isZeroWidthJoiner(charCode)) {
		      charactersArray[charactersArray.length - 1] += text.charAt(i);
		      shouldCombine = true;
		    } else {
		      charactersArray.push(text.charAt(i));
		    }
		    i += 1;
		  }
		  return charactersArray;
		};

		TextProperty.prototype.completeTextData = function (documentData) {
		  documentData.__complete = true;
		  var fontManager = this.elem.globalData.fontManager;
		  var data = this.data;
		  var letters = [];
		  var i; var
		    len;
		  var newLineFlag; var index = 0; var
		    val;
		  var anchorGrouping = data.m.g;
		  var currentSize = 0; var currentPos = 0; var currentLine = 0; var
		    lineWidths = [];
		  var lineWidth = 0;
		  var maxLineWidth = 0;
		  var j; var
		    jLen;
		  var fontData = fontManager.getFontByName(documentData.f);
		  var charData; var
		    cLength = 0;

		  var fontProps = getFontProperties(fontData);
		  documentData.fWeight = fontProps.weight;
		  documentData.fStyle = fontProps.style;
		  documentData.finalSize = documentData.s;
		  documentData.finalText = this.buildFinalText(documentData.t);
		  len = documentData.finalText.length;
		  documentData.finalLineHeight = documentData.lh;
		  var trackingOffset = (documentData.tr / 1000) * documentData.finalSize;
		  var charCode;
		  if (documentData.sz) {
		    var flag = true;
		    var boxWidth = documentData.sz[0];
		    var boxHeight = documentData.sz[1];
		    var currentHeight; var
		      finalText;
		    while (flag) {
		      finalText = this.buildFinalText(documentData.t);
		      currentHeight = 0;
		      lineWidth = 0;
		      len = finalText.length;
		      trackingOffset = (documentData.tr / 1000) * documentData.finalSize;
		      var lastSpaceIndex = -1;
		      for (i = 0; i < len; i += 1) {
		        charCode = finalText[i].charCodeAt(0);
		        newLineFlag = false;
		        if (finalText[i] === ' ') {
		          lastSpaceIndex = i;
		        } else if (charCode === 13 || charCode === 3) {
		          lineWidth = 0;
		          newLineFlag = true;
		          currentHeight += documentData.finalLineHeight || documentData.finalSize * 1.2;
		        }
		        if (fontManager.chars) {
		          charData = fontManager.getCharData(finalText[i], fontData.fStyle, fontData.fFamily);
		          cLength = newLineFlag ? 0 : (charData.w * documentData.finalSize) / 100;
		        } else {
		          // tCanvasHelper.font = documentData.s + 'px '+ fontData.fFamily;
		          cLength = fontManager.measureText(finalText[i], documentData.f, documentData.finalSize);
		        }
		        if (lineWidth + cLength > boxWidth && finalText[i] !== ' ') {
		          if (lastSpaceIndex === -1) {
		            len += 1;
		          } else {
		            i = lastSpaceIndex;
		          }
		          currentHeight += documentData.finalLineHeight || documentData.finalSize * 1.2;
		          finalText.splice(i, lastSpaceIndex === i ? 1 : 0, '\r');
		          // finalText = finalText.substr(0,i) + "\r" + finalText.substr(i === lastSpaceIndex ? i + 1 : i);
		          lastSpaceIndex = -1;
		          lineWidth = 0;
		        } else {
		          lineWidth += cLength;
		          lineWidth += trackingOffset;
		        }
		      }
		      currentHeight += (fontData.ascent * documentData.finalSize) / 100;
		      if (this.canResize && documentData.finalSize > this.minimumFontSize && boxHeight < currentHeight) {
		        documentData.finalSize -= 1;
		        documentData.finalLineHeight = (documentData.finalSize * documentData.lh) / documentData.s;
		      } else {
		        documentData.finalText = finalText;
		        len = documentData.finalText.length;
		        flag = false;
		      }
		    }
		  }
		  lineWidth = -trackingOffset;
		  cLength = 0;
		  var uncollapsedSpaces = 0;
		  var currentChar;
		  for (i = 0; i < len; i += 1) {
		    newLineFlag = false;
		    currentChar = documentData.finalText[i];
		    charCode = currentChar.charCodeAt(0);
		    if (charCode === 13 || charCode === 3) {
		      uncollapsedSpaces = 0;
		      lineWidths.push(lineWidth);
		      maxLineWidth = lineWidth > maxLineWidth ? lineWidth : maxLineWidth;
		      lineWidth = -2 * trackingOffset;
		      val = '';
		      newLineFlag = true;
		      currentLine += 1;
		    } else {
		      val = currentChar;
		    }
		    if (fontManager.chars) {
		      charData = fontManager.getCharData(currentChar, fontData.fStyle, fontManager.getFontByName(documentData.f).fFamily);
		      cLength = newLineFlag ? 0 : (charData.w * documentData.finalSize) / 100;
		    } else {
		      // var charWidth = fontManager.measureText(val, documentData.f, documentData.finalSize);
		      // tCanvasHelper.font = documentData.finalSize + 'px '+ fontManager.getFontByName(documentData.f).fFamily;
		      cLength = fontManager.measureText(val, documentData.f, documentData.finalSize);
		    }

		    //
		    if (currentChar === ' ') {
		      uncollapsedSpaces += cLength + trackingOffset;
		    } else {
		      lineWidth += cLength + trackingOffset + uncollapsedSpaces;
		      uncollapsedSpaces = 0;
		    }
		    letters.push({
		      l: cLength, an: cLength, add: currentSize, n: newLineFlag, anIndexes: [], val: val, line: currentLine, animatorJustifyOffset: 0,
		    });
		    if (anchorGrouping == 2) { // eslint-disable-line eqeqeq
		      currentSize += cLength;
		      if (val === '' || val === ' ' || i === len - 1) {
		        if (val === '' || val === ' ') {
		          currentSize -= cLength;
		        }
		        while (currentPos <= i) {
		          letters[currentPos].an = currentSize;
		          letters[currentPos].ind = index;
		          letters[currentPos].extra = cLength;
		          currentPos += 1;
		        }
		        index += 1;
		        currentSize = 0;
		      }
		    } else if (anchorGrouping == 3) { // eslint-disable-line eqeqeq
		      currentSize += cLength;
		      if (val === '' || i === len - 1) {
		        if (val === '') {
		          currentSize -= cLength;
		        }
		        while (currentPos <= i) {
		          letters[currentPos].an = currentSize;
		          letters[currentPos].ind = index;
		          letters[currentPos].extra = cLength;
		          currentPos += 1;
		        }
		        currentSize = 0;
		        index += 1;
		      }
		    } else {
		      letters[index].ind = index;
		      letters[index].extra = 0;
		      index += 1;
		    }
		  }
		  documentData.l = letters;
		  maxLineWidth = lineWidth > maxLineWidth ? lineWidth : maxLineWidth;
		  lineWidths.push(lineWidth);
		  if (documentData.sz) {
		    documentData.boxWidth = documentData.sz[0];
		    documentData.justifyOffset = 0;
		  } else {
		    documentData.boxWidth = maxLineWidth;
		    switch (documentData.j) {
		      case 1:
		        documentData.justifyOffset = -documentData.boxWidth;
		        break;
		      case 2:
		        documentData.justifyOffset = -documentData.boxWidth / 2;
		        break;
		      default:
		        documentData.justifyOffset = 0;
		    }
		  }
		  documentData.lineWidths = lineWidths;

		  var animators = data.a; var animatorData; var
		    letterData;
		  jLen = animators.length;
		  var based; var ind; var
		    indexes = [];
		  for (j = 0; j < jLen; j += 1) {
		    animatorData = animators[j];
		    if (animatorData.a.sc) {
		      documentData.strokeColorAnim = true;
		    }
		    if (animatorData.a.sw) {
		      documentData.strokeWidthAnim = true;
		    }
		    if (animatorData.a.fc || animatorData.a.fh || animatorData.a.fs || animatorData.a.fb) {
		      documentData.fillColorAnim = true;
		    }
		    ind = 0;
		    based = animatorData.s.b;
		    for (i = 0; i < len; i += 1) {
		      letterData = letters[i];
		      letterData.anIndexes[j] = ind;
		      if ((based == 1 && letterData.val !== '') || (based == 2 && letterData.val !== '' && letterData.val !== ' ') || (based == 3 && (letterData.n || letterData.val == ' ' || i == len - 1)) || (based == 4 && (letterData.n || i == len - 1))) { // eslint-disable-line eqeqeq
		        if (animatorData.s.rn === 1) {
		          indexes.push(ind);
		        }
		        ind += 1;
		      }
		    }
		    data.a[j].s.totalChars = ind;
		    var currentInd = -1; var
		      newInd;
		    if (animatorData.s.rn === 1) {
		      for (i = 0; i < len; i += 1) {
		        letterData = letters[i];
		        if (currentInd != letterData.anIndexes[j]) { // eslint-disable-line eqeqeq
		          currentInd = letterData.anIndexes[j];
		          newInd = indexes.splice(Math.floor(Math.random() * indexes.length), 1)[0];
		        }
		        letterData.anIndexes[j] = newInd;
		      }
		    }
		  }
		  documentData.yOffset = documentData.finalLineHeight || documentData.finalSize * 1.2;
		  documentData.ls = documentData.ls || 0;
		  documentData.ascent = (fontData.ascent * documentData.finalSize) / 100;
		};

		TextProperty.prototype.updateDocumentData = function (newData, index) {
		  index = index === undefined ? this.keysIndex : index;
		  var dData = this.copyData({}, this.data.d.k[index].s);
		  dData = this.copyData(dData, newData);
		  this.data.d.k[index].s = dData;
		  this.recalculate(index);
		  this.elem.addDynamicProperty(this);
		};

		TextProperty.prototype.recalculate = function (index) {
		  var dData = this.data.d.k[index].s;
		  dData.__complete = false;
		  this.keysIndex = 0;
		  this._isFirstFrame = true;
		  this.getValue(dData);
		};

		TextProperty.prototype.canResizeFont = function (_canResize) {
		  this.canResize = _canResize;
		  this.recalculate(this.keysIndex);
		  this.elem.addDynamicProperty(this);
		};

		TextProperty.prototype.setMinimumFontSize = function (_fontValue) {
		  this.minimumFontSize = Math.floor(_fontValue) || 1;
		  this.recalculate(this.keysIndex);
		  this.elem.addDynamicProperty(this);
		};

		/* global extendPrototype, BezierFactory, PropertyFactory, DynamicPropertyContainer */
		/* exported TextSelectorProp */

		var TextSelectorProp = (function () {
		  var max = Math.max;
		  var min = Math.min;
		  var floor = Math.floor;

		  function TextSelectorPropFactory(elem, data) {
		    this._currentTextLength = -1;
		    this.k = false;
		    this.data = data;
		    this.elem = elem;
		    this.comp = elem.comp;
		    this.finalS = 0;
		    this.finalE = 0;
		    this.initDynamicPropertyContainer(elem);
		    this.s = PropertyFactory.getProp(elem, data.s || { k: 0 }, 0, 0, this);
		    if ('e' in data) {
		      this.e = PropertyFactory.getProp(elem, data.e, 0, 0, this);
		    } else {
		      this.e = { v: 100 };
		    }
		    this.o = PropertyFactory.getProp(elem, data.o || { k: 0 }, 0, 0, this);
		    this.xe = PropertyFactory.getProp(elem, data.xe || { k: 0 }, 0, 0, this);
		    this.ne = PropertyFactory.getProp(elem, data.ne || { k: 0 }, 0, 0, this);
		    this.sm = PropertyFactory.getProp(elem, data.sm || { k: 100 }, 0, 0, this);
		    this.a = PropertyFactory.getProp(elem, data.a, 0, 0.01, this);
		    if (!this.dynamicProperties.length) {
		      this.getValue();
		    }
		  }

		  TextSelectorPropFactory.prototype = {
		    getMult: function (ind) {
		      if (this._currentTextLength !== this.elem.textProperty.currentData.l.length) {
		        this.getValue();
		      }
		      // var easer = bez.getEasingCurve(this.ne.v/100,0,1-this.xe.v/100,1);
		      var x1 = 0;
		      var y1 = 0;
		      var x2 = 1;
		      var y2 = 1;
		      if (this.ne.v > 0) {
		        x1 = this.ne.v / 100.0;
		      } else {
		        y1 = -this.ne.v / 100.0;
		      }
		      if (this.xe.v > 0) {
		        x2 = 1.0 - this.xe.v / 100.0;
		      } else {
		        y2 = 1.0 + this.xe.v / 100.0;
		      }
		      var easer = BezierFactory.getBezierEasing(x1, y1, x2, y2).get;

		      var mult = 0;
		      var s = this.finalS;
		      var e = this.finalE;
		      var type = this.data.sh;
		      if (type === 2) {
		        if (e === s) {
		          mult = ind >= e ? 1 : 0;
		        } else {
		          mult = max(0, min(0.5 / (e - s) + (ind - s) / (e - s), 1));
		        }
		        mult = easer(mult);
		      } else if (type === 3) {
		        if (e === s) {
		          mult = ind >= e ? 0 : 1;
		        } else {
		          mult = 1 - max(0, min(0.5 / (e - s) + (ind - s) / (e - s), 1));
		        }

		        mult = easer(mult);
		      } else if (type === 4) {
		        if (e === s) {
		          mult = 0;
		        } else {
		          mult = max(0, min(0.5 / (e - s) + (ind - s) / (e - s), 1));
		          if (mult < 0.5) {
		            mult *= 2;
		          } else {
		            mult = 1 - 2 * (mult - 0.5);
		          }
		        }
		        mult = easer(mult);
		      } else if (type === 5) {
		        if (e === s) {
		          mult = 0;
		        } else {
		          var tot = e - s;
		          /* ind += 0.5;
		                    mult = -4/(tot*tot)*(ind*ind)+(4/tot)*ind; */
		          ind = min(max(0, ind + 0.5 - s), e - s);
		          var x = -tot / 2 + ind;
		          var a = tot / 2;
		          mult = Math.sqrt(1 - (x * x) / (a * a));
		        }
		        mult = easer(mult);
		      } else if (type === 6) {
		        if (e === s) {
		          mult = 0;
		        } else {
		          ind = min(max(0, ind + 0.5 - s), e - s);
		          mult = (1 + (Math.cos((Math.PI + Math.PI * 2 * (ind) / (e - s))))) / 2; // eslint-disable-line
		        }
		        mult = easer(mult);
		      } else {
		        if (ind >= floor(s)) {
		          if (ind - s < 0) {
		            mult = max(0, min(min(e, 1) - (s - ind), 1));
		          } else {
		            mult = max(0, min(e - ind, 1));
		          }
		        }
		        mult = easer(mult);
		      }
		      // Smoothness implementation.
		      // The smoothness represents a reduced range of the original [0; 1] range.
		      // if smoothness is 25%, the new range will be [0.375; 0.625]
		      // Steps are:
		      // - find the lower value of the new range (threshold)
		      // - if multiplier is smaller than that value, floor it to 0
		      // - if it is larger,
		      //     - subtract the threshold
		      //     - divide it by the smoothness (this will return the range to [0; 1])
		      // Note: If it doesn't work on some scenarios, consider applying it before the easer.
		      if (this.sm.v !== 100) {
		        var smoothness = this.sm.v * 0.01;
		        if (smoothness === 0) {
		          smoothness = 0.00000001;
		        }
		        var threshold = 0.5 - smoothness * 0.5;
		        if (mult < threshold) {
		          mult = 0;
		        } else {
		          mult = (mult - threshold) / smoothness;
		          if (mult > 1) {
		            mult = 1;
		          }
		        }
		      }
		      return mult * this.a.v;
		    },
		    getValue: function (newCharsFlag) {
		      this.iterateDynamicProperties();
		      this._mdf = newCharsFlag || this._mdf;
		      this._currentTextLength = this.elem.textProperty.currentData.l.length || 0;
		      if (newCharsFlag && this.data.r === 2) {
		        this.e.v = this._currentTextLength;
		      }
		      var divisor = this.data.r === 2 ? 1 : 100 / this.data.totalChars;
		      var o = this.o.v / divisor;
		      var s = this.s.v / divisor + o;
		      var e = (this.e.v / divisor) + o;
		      if (s > e) {
		        var _s = s;
		        s = e;
		        e = _s;
		      }
		      this.finalS = s;
		      this.finalE = e;
		    },
		  };
		  extendPrototype([DynamicPropertyContainer], TextSelectorPropFactory);

		  function getTextSelectorProp(elem, data, arr) {
		    return new TextSelectorPropFactory(elem, data);
		  }

		  return {
		    getTextSelectorProp: getTextSelectorProp,
		  };
		}());

		/* global createSizedArray, pooling */
		/* exported poolFactory */

		var poolFactory = (function () {
		  return function (initialLength, _create, _release) {
		    var _length = 0;
		    var _maxLength = initialLength;
		    var pool = createSizedArray(_maxLength);

		    var ob = {
		      newElement: newElement,
		      release: release,
		    };

		    function newElement() {
		      var element;
		      if (_length) {
		        _length -= 1;
		        element = pool[_length];
		      } else {
		        element = _create();
		      }
		      return element;
		    }

		    function release(element) {
		      if (_length === _maxLength) {
		        pool = pooling.double(pool);
		        _maxLength *= 2;
		      }
		      if (_release) {
		        _release(element);
		      }
		      pool[_length] = element;
		      _length += 1;
		    }

		    return ob;
		  };
		}());

		/* global createSizedArray */
		/* exported pooling */

		var pooling = (function () {
		  function double(arr) {
		    return arr.concat(createSizedArray(arr.length));
		  }

		  return {
		    double: double,
		  };
		}());

		/* global createTypedArray, poolFactory */
		/* exported pointPool */

		var pointPool = (function () {
		  function create() {
		    return createTypedArray('float32', 2);
		  }
		  return poolFactory(8, create);
		}());

		/* global ShapePath, pointPool, poolFactory */
		/* exported shapePool */

		var shapePool = (function () {
		  function create() {
		    return new ShapePath();
		  }

		  function release(shapePath) {
		    var len = shapePath._length;
		    var i;
		    for (i = 0; i < len; i += 1) {
		      pointPool.release(shapePath.v[i]);
		      pointPool.release(shapePath.i[i]);
		      pointPool.release(shapePath.o[i]);
		      shapePath.v[i] = null;
		      shapePath.i[i] = null;
		      shapePath.o[i] = null;
		    }
		    shapePath._length = 0;
		    shapePath.c = false;
		  }

		  function clone(shape) {
		    var cloned = factory.newElement();
		    var i;
		    var len = shape._length === undefined ? shape.v.length : shape._length;
		    cloned.setLength(len);
		    cloned.c = shape.c;

		    for (i = 0; i < len; i += 1) {
		      cloned.setTripleAt(shape.v[i][0], shape.v[i][1], shape.o[i][0], shape.o[i][1], shape.i[i][0], shape.i[i][1], i);
		    }
		    return cloned;
		  }

		  var factory = poolFactory(4, create, release);
		  factory.clone = clone;

		  return factory;
		}());

		/* global createSizedArray, ShapeCollection, shapePool, pooling */
		/* exported shapeCollectionPool */

		var shapeCollectionPool = (function () {
		  var ob = {
		    newShapeCollection: newShapeCollection,
		    release: release,
		  };

		  var _length = 0;
		  var _maxLength = 4;
		  var pool = createSizedArray(_maxLength);

		  function newShapeCollection() {
		    var shapeCollection;
		    if (_length) {
		      _length -= 1;
		      shapeCollection = pool[_length];
		    } else {
		      shapeCollection = new ShapeCollection();
		    }
		    return shapeCollection;
		  }

		  function release(shapeCollection) {
		    var i;
		    var len = shapeCollection._length;
		    for (i = 0; i < len; i += 1) {
		      shapePool.release(shapeCollection.shapes[i]);
		    }
		    shapeCollection._length = 0;

		    if (_length === _maxLength) {
		      pool = pooling.double(pool);
		      _maxLength *= 2;
		    }
		    pool[_length] = shapeCollection;
		    _length += 1;
		  }

		  return ob;
		}());

		/* global poolFactory, bezierLengthPool */
		/* exported segmentsLengthPool */

		var segmentsLengthPool = (function () {
		  function create() {
		    return {
		      lengths: [],
		      totalLength: 0,
		    };
		  }

		  function release(element) {
		    var i;
		    var len = element.lengths.length;
		    for (i = 0; i < len; i += 1) {
		      bezierLengthPool.release(element.lengths[i]);
		    }
		    element.lengths.length = 0;
		  }

		  return poolFactory(8, create, release);
		}());

		/* global createTypedArray, defaultCurveSegments, poolFactory */
		/* exported bezierLengthPool */

		var bezierLengthPool = (function () {
		  function create() {
		    return {
		      addedLength: 0,
		      percents: createTypedArray('float32', defaultCurveSegments),
		      lengths: createTypedArray('float32', defaultCurveSegments),
		    };
		  }
		  return poolFactory(8, create);
		}());

		/* exported markerParser */

		var markerParser = (

		  function () {
		    function parsePayloadLines(payload) {
		      var lines = payload.split('\r\n');
		      var keys = {};
		      var line;
		      var keysCount = 0;
		      for (var i = 0; i < lines.length; i += 1) {
		        line = lines[i].split(':');
		        if (line.length === 2) {
		          keys[line[0]] = line[1].trim();
		          keysCount += 1;
		        }
		      }
		      if (keysCount === 0) {
		        throw new Error();
		      }
		      return keys;
		    }

		    return function (_markers) {
		      var markers = [];
		      for (var i = 0; i < _markers.length; i += 1) {
		        var _marker = _markers[i];
		        var markerData = {
		          time: _marker.tm,
		          duration: _marker.dr,
		        };
		        try {
		          markerData.payload = JSON.parse(_markers[i].cm);
		        } catch (_) {
		          try {
		            markerData.payload = parsePayloadLines(_markers[i].cm);
		          } catch (__) {
		            markerData.payload = {
		              name: _markers[i],
		            };
		          }
		        }
		        markers.push(markerData);
		      }
		      return markers;
		    };
		  }());

		/* global AudioElement, FootageElement, FontManager */

		function BaseRenderer() {}
		BaseRenderer.prototype.checkLayers = function (num) {
		  var i;
		  var len = this.layers.length;
		  var data;
		  this.completeLayers = true;
		  for (i = len - 1; i >= 0; i -= 1) {
		    if (!this.elements[i]) {
		      data = this.layers[i];
		      if (data.ip - data.st <= (num - this.layers[i].st) && data.op - data.st > (num - this.layers[i].st)) {
		        this.buildItem(i);
		      }
		    }
		    this.completeLayers = this.elements[i] ? this.completeLayers : false;
		  }
		  this.checkPendingElements();
		};

		BaseRenderer.prototype.createItem = function (layer) {
		  switch (layer.ty) {
		    case 2:
		      return this.createImage(layer);
		    case 0:
		      return this.createComp(layer);
		    case 1:
		      return this.createSolid(layer);
		    case 3:
		      return this.createNull(layer);
		    case 4:
		      return this.createShape(layer);
		    case 5:
		      return this.createText(layer);
		    case 6:
		      return this.createAudio(layer);
		    case 13:
		      return this.createCamera(layer);
		    case 15:
		      return this.createFootage(layer);
		    default:
		      return this.createNull(layer);
		  }
		};

		BaseRenderer.prototype.createCamera = function () {
		  throw new Error('You\'re using a 3d camera. Try the html renderer.');
		};

		BaseRenderer.prototype.createAudio = function (data) {
		  return new AudioElement(data, this.globalData, this);
		};

		BaseRenderer.prototype.createFootage = function (data) {
		  return new FootageElement(data, this.globalData, this);
		};

		BaseRenderer.prototype.buildAllItems = function () {
		  var i;
		  var len = this.layers.length;
		  for (i = 0; i < len; i += 1) {
		    this.buildItem(i);
		  }
		  this.checkPendingElements();
		};

		BaseRenderer.prototype.includeLayers = function (newLayers) {
		  this.completeLayers = false;
		  var i;
		  var len = newLayers.length;
		  var j;
		  var jLen = this.layers.length;
		  for (i = 0; i < len; i += 1) {
		    j = 0;
		    while (j < jLen) {
		      if (this.layers[j].id === newLayers[i].id) {
		        this.layers[j] = newLayers[i];
		        break;
		      }
		      j += 1;
		    }
		  }
		};

		BaseRenderer.prototype.setProjectInterface = function (pInterface) {
		  this.globalData.projectInterface = pInterface;
		};

		BaseRenderer.prototype.initItems = function () {
		  if (!this.globalData.progressiveLoad) {
		    this.buildAllItems();
		  }
		};
		BaseRenderer.prototype.buildElementParenting = function (element, parentName, hierarchy) {
		  var elements = this.elements;
		  var layers = this.layers;
		  var i = 0;
		  var len = layers.length;
		  while (i < len) {
		    if (layers[i].ind == parentName) { // eslint-disable-line eqeqeq
		      if (!elements[i] || elements[i] === true) {
		        this.buildItem(i);
		        this.addPendingElement(element);
		      } else {
		        hierarchy.push(elements[i]);
		        elements[i].setAsParent();
		        if (layers[i].parent !== undefined) {
		          this.buildElementParenting(element, layers[i].parent, hierarchy);
		        } else {
		          element.setHierarchy(hierarchy);
		        }
		      }
		    }
		    i += 1;
		  }
		};

		BaseRenderer.prototype.addPendingElement = function (element) {
		  this.pendingElements.push(element);
		};

		BaseRenderer.prototype.searchExtraCompositions = function (assets) {
		  var i;
		  var len = assets.length;
		  for (i = 0; i < len; i += 1) {
		    if (assets[i].xt) {
		      var comp = this.createComp(assets[i]);
		      comp.initExpressions();
		      this.globalData.projectInterface.registerComposition(comp);
		    }
		  }
		};

		BaseRenderer.prototype.setupGlobalData = function (animData, fontsContainer) {
		  this.globalData.fontManager = new FontManager();
		  this.globalData.fontManager.addChars(animData.chars);
		  this.globalData.fontManager.addFonts(animData.fonts, fontsContainer);
		  this.globalData.getAssetData = this.animationItem.getAssetData.bind(this.animationItem);
		  this.globalData.getAssetsPath = this.animationItem.getAssetsPath.bind(this.animationItem);
		  this.globalData.imageLoader = this.animationItem.imagePreloader;
		  this.globalData.audioController = this.animationItem.audioController;
		  this.globalData.frameId = 0;
		  this.globalData.frameRate = animData.fr;
		  this.globalData.nm = animData.nm;
		  this.globalData.compSize = {
		    w: animData.w,
		    h: animData.h,
		  };
		};

		/* global createElementID, extendPrototype, BaseRenderer, NullElement, SVGShapeElement, SVGTextLottieElement,
		IImageElement, SVGCompElement, ISolidElement, createNS, locationHref, createSizedArray, expressionsPlugin */

		function SVGRenderer(animationItem, config) {
		  this.animationItem = animationItem;
		  this.layers = null;
		  this.renderedFrame = -1;
		  this.svgElement = createNS('svg');
		  var ariaLabel = '';
		  if (config && config.title) {
		    var titleElement = createNS('title');
		    var titleId = createElementID();
		    titleElement.setAttribute('id', titleId);
		    titleElement.textContent = config.title;
		    this.svgElement.appendChild(titleElement);
		    ariaLabel += titleId;
		  }
		  if (config && config.description) {
		    var descElement = createNS('desc');
		    var descId = createElementID();
		    descElement.setAttribute('id', descId);
		    descElement.textContent = config.description;
		    this.svgElement.appendChild(descElement);
		    ariaLabel += ' ' + descId;
		  }
		  if (ariaLabel) {
		    this.svgElement.setAttribute('aria-labelledby', ariaLabel);
		  }
		  var defs = createNS('defs');
		  this.svgElement.appendChild(defs);
		  var maskElement = createNS('g');
		  this.svgElement.appendChild(maskElement);
		  this.layerElement = maskElement;
		  this.renderConfig = {
		    preserveAspectRatio: (config && config.preserveAspectRatio) || 'xMidYMid meet',
		    imagePreserveAspectRatio: (config && config.imagePreserveAspectRatio) || 'xMidYMid slice',
		    contentVisibility: (config && config.contentVisibility) || 'visible',
		    progressiveLoad: (config && config.progressiveLoad) || false,
		    hideOnTransparent: !((config && config.hideOnTransparent === false)),
		    viewBoxOnly: (config && config.viewBoxOnly) || false,
		    viewBoxSize: (config && config.viewBoxSize) || false,
		    className: (config && config.className) || '',
		    id: (config && config.id) || '',
		    focusable: config && config.focusable,
		    filterSize: {
		      width: (config && config.filterSize && config.filterSize.width) || '100%',
		      height: (config && config.filterSize && config.filterSize.height) || '100%',
		      x: (config && config.filterSize && config.filterSize.x) || '0%',
		      y: (config && config.filterSize && config.filterSize.y) || '0%',
		    },
		  };

		  this.globalData = {
		    _mdf: false,
		    frameNum: -1,
		    defs: defs,
		    renderConfig: this.renderConfig,
		  };
		  this.elements = [];
		  this.pendingElements = [];
		  this.destroyed = false;
		  this.rendererType = 'svg';
		}

		extendPrototype([BaseRenderer], SVGRenderer);

		SVGRenderer.prototype.createNull = function (data) {
		  return new NullElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.createShape = function (data) {
		  return new SVGShapeElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.createText = function (data) {
		  return new SVGTextLottieElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.createImage = function (data) {
		  return new IImageElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.createComp = function (data) {
		  return new SVGCompElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.createSolid = function (data) {
		  return new ISolidElement(data, this.globalData, this);
		};

		SVGRenderer.prototype.configAnimation = function (animData) {
		  this.svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		  if (this.renderConfig.viewBoxSize) {
		    this.svgElement.setAttribute('viewBox', this.renderConfig.viewBoxSize);
		  } else {
		    this.svgElement.setAttribute('viewBox', '0 0 ' + animData.w + ' ' + animData.h);
		  }

		  if (!this.renderConfig.viewBoxOnly) {
		    this.svgElement.setAttribute('width', animData.w);
		    this.svgElement.setAttribute('height', animData.h);
		    this.svgElement.style.width = '100%';
		    this.svgElement.style.height = '100%';
		    this.svgElement.style.transform = 'translate3d(0,0,0)';
		    this.svgElement.style.contentVisibility = this.renderConfig.contentVisibility;
		  }
		  if (this.renderConfig.className) {
		    this.svgElement.setAttribute('class', this.renderConfig.className);
		  }
		  if (this.renderConfig.id) {
		    this.svgElement.setAttribute('id', this.renderConfig.id);
		  }
		  if (this.renderConfig.focusable !== undefined) {
		    this.svgElement.setAttribute('focusable', this.renderConfig.focusable);
		  }
		  this.svgElement.setAttribute('preserveAspectRatio', this.renderConfig.preserveAspectRatio);
		  // this.layerElement.style.transform = 'translate3d(0,0,0)';
		  // this.layerElement.style.transformOrigin = this.layerElement.style.mozTransformOrigin = this.layerElement.style.webkitTransformOrigin = this.layerElement.style['-webkit-transform'] = "0px 0px 0px";
		  this.animationItem.wrapper.appendChild(this.svgElement);
		  // Mask animation
		  var defs = this.globalData.defs;

		  this.setupGlobalData(animData, defs);
		  this.globalData.progressiveLoad = this.renderConfig.progressiveLoad;
		  this.data = animData;

		  var maskElement = createNS('clipPath');
		  var rect = createNS('rect');
		  rect.setAttribute('width', animData.w);
		  rect.setAttribute('height', animData.h);
		  rect.setAttribute('x', 0);
		  rect.setAttribute('y', 0);
		  var maskId = createElementID();
		  maskElement.setAttribute('id', maskId);
		  maskElement.appendChild(rect);
		  this.layerElement.setAttribute('clip-path', 'url(' + locationHref + '#' + maskId + ')');

		  defs.appendChild(maskElement);
		  this.layers = animData.layers;
		  this.elements = createSizedArray(animData.layers.length);
		};

		SVGRenderer.prototype.destroy = function () {
		  if (this.animationItem.wrapper) {
		    this.animationItem.wrapper.innerText = '';
		  }
		  this.layerElement = null;
		  this.globalData.defs = null;
		  var i;
		  var len = this.layers ? this.layers.length : 0;
		  for (i = 0; i < len; i += 1) {
		    if (this.elements[i]) {
		      this.elements[i].destroy();
		    }
		  }
		  this.elements.length = 0;
		  this.destroyed = true;
		  this.animationItem = null;
		};

		SVGRenderer.prototype.updateContainerSize = function () {
		};

		SVGRenderer.prototype.buildItem = function (pos) {
		  var elements = this.elements;
		  if (elements[pos] || this.layers[pos].ty === 99) {
		    return;
		  }
		  elements[pos] = true;
		  var element = this.createItem(this.layers[pos]);

		  elements[pos] = element;
		  if (expressionsPlugin) {
		    if (this.layers[pos].ty === 0) {
		      this.globalData.projectInterface.registerComposition(element);
		    }
		    element.initExpressions();
		  }
		  this.appendElementInPos(element, pos);
		  if (this.layers[pos].tt) {
		    if (!this.elements[pos - 1] || this.elements[pos - 1] === true) {
		      this.buildItem(pos - 1);
		      this.addPendingElement(element);
		    } else {
		      element.setMatte(elements[pos - 1].layerId);
		    }
		  }
		};

		SVGRenderer.prototype.checkPendingElements = function () {
		  while (this.pendingElements.length) {
		    var element = this.pendingElements.pop();
		    element.checkParenting();
		    if (element.data.tt) {
		      var i = 0;
		      var len = this.elements.length;
		      while (i < len) {
		        if (this.elements[i] === element) {
		          element.setMatte(this.elements[i - 1].layerId);
		          break;
		        }
		        i += 1;
		      }
		    }
		  }
		};

		SVGRenderer.prototype.renderFrame = function (num) {
		  if (this.renderedFrame === num || this.destroyed) {
		    return;
		  }
		  if (num === null) {
		    num = this.renderedFrame;
		  } else {
		    this.renderedFrame = num;
		  }
		  // console.log('-------');
		  // console.log('FRAME ',num);
		  this.globalData.frameNum = num;
		  this.globalData.frameId += 1;
		  this.globalData.projectInterface.currentFrame = num;
		  this.globalData._mdf = false;
		  var i;
		  var len = this.layers.length;
		  if (!this.completeLayers) {
		    this.checkLayers(num);
		  }
		  for (i = len - 1; i >= 0; i -= 1) {
		    if (this.completeLayers || this.elements[i]) {
		      this.elements[i].prepareFrame(num - this.layers[i].st);
		    }
		  }
		  if (this.globalData._mdf) {
		    for (i = 0; i < len; i += 1) {
		      if (this.completeLayers || this.elements[i]) {
		        this.elements[i].renderFrame();
		      }
		    }
		  }
		};

		SVGRenderer.prototype.appendElementInPos = function (element, pos) {
		  var newElement = element.getBaseElement();
		  if (!newElement) {
		    return;
		  }
		  var i = 0;
		  var nextElement;
		  while (i < pos) {
		    if (this.elements[i] && this.elements[i] !== true && this.elements[i].getBaseElement()) {
		      nextElement = this.elements[i].getBaseElement();
		    }
		    i += 1;
		  }
		  if (nextElement) {
		    this.layerElement.insertBefore(newElement, nextElement);
		  } else {
		    this.layerElement.appendChild(newElement);
		  }
		};

		SVGRenderer.prototype.hide = function () {
		  this.layerElement.style.display = 'none';
		};

		SVGRenderer.prototype.show = function () {
		  this.layerElement.style.display = 'block';
		};

		/* global createSizedArray, createElementID, PropertyFactory, ShapePropertyFactory, createNS, locationHref */

		function MaskElement(data, element, globalData) {
		  this.data = data;
		  this.element = element;
		  this.globalData = globalData;
		  this.storedData = [];
		  this.masksProperties = this.data.masksProperties || [];
		  this.maskElement = null;
		  var defs = this.globalData.defs;
		  var i;
		  var len = this.masksProperties ? this.masksProperties.length : 0;
		  this.viewData = createSizedArray(len);
		  this.solidPath = '';

		  var path;
		  var properties = this.masksProperties;
		  var count = 0;
		  var currentMasks = [];
		  var j;
		  var jLen;
		  var layerId = createElementID();
		  var rect;
		  var expansor;
		  var feMorph;
		  var x;
		  var maskType = 'clipPath';
		  var maskRef = 'clip-path';
		  for (i = 0; i < len; i += 1) {
		    if ((properties[i].mode !== 'a' && properties[i].mode !== 'n') || properties[i].inv || properties[i].o.k !== 100 || properties[i].o.x) {
		      maskType = 'mask';
		      maskRef = 'mask';
		    }

		    if ((properties[i].mode === 's' || properties[i].mode === 'i') && count === 0) {
		      rect = createNS('rect');
		      rect.setAttribute('fill', '#ffffff');
		      rect.setAttribute('width', this.element.comp.data.w || 0);
		      rect.setAttribute('height', this.element.comp.data.h || 0);
		      currentMasks.push(rect);
		    } else {
		      rect = null;
		    }

		    path = createNS('path');
		    if (properties[i].mode === 'n') {
		      // TODO move this to a factory or to a constructor
		      this.viewData[i] = {
		        op: PropertyFactory.getProp(this.element, properties[i].o, 0, 0.01, this.element),
		        prop: ShapePropertyFactory.getShapeProp(this.element, properties[i], 3),
		        elem: path,
		        lastPath: '',
		      };
		      defs.appendChild(path);
		    } else {
		      count += 1;

		      path.setAttribute('fill', properties[i].mode === 's' ? '#000000' : '#ffffff');
		      path.setAttribute('clip-rule', 'nonzero');
		      var filterID;

		      if (properties[i].x.k !== 0) {
		        maskType = 'mask';
		        maskRef = 'mask';
		        x = PropertyFactory.getProp(this.element, properties[i].x, 0, null, this.element);
		        filterID = createElementID();
		        expansor = createNS('filter');
		        expansor.setAttribute('id', filterID);
		        feMorph = createNS('feMorphology');
		        feMorph.setAttribute('operator', 'erode');
		        feMorph.setAttribute('in', 'SourceGraphic');
		        feMorph.setAttribute('radius', '0');
		        expansor.appendChild(feMorph);
		        defs.appendChild(expansor);
		        path.setAttribute('stroke', properties[i].mode === 's' ? '#000000' : '#ffffff');
		      } else {
		        feMorph = null;
		        x = null;
		      }

		      // TODO move this to a factory or to a constructor
		      this.storedData[i] = {
		        elem: path,
		        x: x,
		        expan: feMorph,
		        lastPath: '',
		        lastOperator: '',
		        filterId: filterID,
		        lastRadius: 0,
		      };
		      if (properties[i].mode === 'i') {
		        jLen = currentMasks.length;
		        var g = createNS('g');
		        for (j = 0; j < jLen; j += 1) {
		          g.appendChild(currentMasks[j]);
		        }
		        var mask = createNS('mask');
		        mask.setAttribute('mask-type', 'alpha');
		        mask.setAttribute('id', layerId + '_' + count);
		        mask.appendChild(path);
		        defs.appendChild(mask);
		        g.setAttribute('mask', 'url(' + locationHref + '#' + layerId + '_' + count + ')');

		        currentMasks.length = 0;
		        currentMasks.push(g);
		      } else {
		        currentMasks.push(path);
		      }
		      if (properties[i].inv && !this.solidPath) {
		        this.solidPath = this.createLayerSolidPath();
		      }
		      // TODO move this to a factory or to a constructor
		      this.viewData[i] = {
		        elem: path,
		        lastPath: '',
		        op: PropertyFactory.getProp(this.element, properties[i].o, 0, 0.01, this.element),
		        prop: ShapePropertyFactory.getShapeProp(this.element, properties[i], 3),
		        invRect: rect,
		      };
		      if (!this.viewData[i].prop.k) {
		        this.drawPath(properties[i], this.viewData[i].prop.v, this.viewData[i]);
		      }
		    }
		  }

		  this.maskElement = createNS(maskType);

		  len = currentMasks.length;
		  for (i = 0; i < len; i += 1) {
		    this.maskElement.appendChild(currentMasks[i]);
		  }

		  if (count > 0) {
		    this.maskElement.setAttribute('id', layerId);
		    this.element.maskedElement.setAttribute(maskRef, 'url(' + locationHref + '#' + layerId + ')');
		    defs.appendChild(this.maskElement);
		  }
		  if (this.viewData.length) {
		    this.element.addRenderableComponent(this);
		  }
		}

		MaskElement.prototype.getMaskProperty = function (pos) {
		  return this.viewData[pos].prop;
		};

		MaskElement.prototype.renderFrame = function (isFirstFrame) {
		  var finalMat = this.element.finalTransform.mat;
		  var i;
		  var len = this.masksProperties.length;
		  for (i = 0; i < len; i += 1) {
		    if (this.viewData[i].prop._mdf || isFirstFrame) {
		      this.drawPath(this.masksProperties[i], this.viewData[i].prop.v, this.viewData[i]);
		    }
		    if (this.viewData[i].op._mdf || isFirstFrame) {
		      this.viewData[i].elem.setAttribute('fill-opacity', this.viewData[i].op.v);
		    }
		    if (this.masksProperties[i].mode !== 'n') {
		      if (this.viewData[i].invRect && (this.element.finalTransform.mProp._mdf || isFirstFrame)) {
		        this.viewData[i].invRect.setAttribute('transform', finalMat.getInverseMatrix().to2dCSS());
		      }
		      if (this.storedData[i].x && (this.storedData[i].x._mdf || isFirstFrame)) {
		        var feMorph = this.storedData[i].expan;
		        if (this.storedData[i].x.v < 0) {
		          if (this.storedData[i].lastOperator !== 'erode') {
		            this.storedData[i].lastOperator = 'erode';
		            this.storedData[i].elem.setAttribute('filter', 'url(' + locationHref + '#' + this.storedData[i].filterId + ')');
		          }
		          feMorph.setAttribute('radius', -this.storedData[i].x.v);
		        } else {
		          if (this.storedData[i].lastOperator !== 'dilate') {
		            this.storedData[i].lastOperator = 'dilate';
		            this.storedData[i].elem.setAttribute('filter', null);
		          }
		          this.storedData[i].elem.setAttribute('stroke-width', this.storedData[i].x.v * 2);
		        }
		      }
		    }
		  }
		};

		MaskElement.prototype.getMaskelement = function () {
		  return this.maskElement;
		};

		MaskElement.prototype.createLayerSolidPath = function () {
		  var path = 'M0,0 ';
		  path += ' h' + this.globalData.compSize.w;
		  path += ' v' + this.globalData.compSize.h;
		  path += ' h-' + this.globalData.compSize.w;
		  path += ' v-' + this.globalData.compSize.h + ' ';
		  return path;
		};

		MaskElement.prototype.drawPath = function (pathData, pathNodes, viewData) {
		  var pathString = ' M' + pathNodes.v[0][0] + ',' + pathNodes.v[0][1];
		  var i;
		  var len;
		  len = pathNodes._length;
		  for (i = 1; i < len; i += 1) {
		    // pathString += " C"+pathNodes.o[i-1][0]+','+pathNodes.o[i-1][1] + " "+pathNodes.i[i][0]+','+pathNodes.i[i][1] + " "+pathNodes.v[i][0]+','+pathNodes.v[i][1];
		    pathString += ' C' + pathNodes.o[i - 1][0] + ',' + pathNodes.o[i - 1][1] + ' ' + pathNodes.i[i][0] + ',' + pathNodes.i[i][1] + ' ' + pathNodes.v[i][0] + ',' + pathNodes.v[i][1];
		  }
		  // pathString += " C"+pathNodes.o[i-1][0]+','+pathNodes.o[i-1][1] + " "+pathNodes.i[0][0]+','+pathNodes.i[0][1] + " "+pathNodes.v[0][0]+','+pathNodes.v[0][1];
		  if (pathNodes.c && len > 1) {
		    pathString += ' C' + pathNodes.o[i - 1][0] + ',' + pathNodes.o[i - 1][1] + ' ' + pathNodes.i[0][0] + ',' + pathNodes.i[0][1] + ' ' + pathNodes.v[0][0] + ',' + pathNodes.v[0][1];
		  }
		  // pathNodes.__renderedString = pathString;

		  if (viewData.lastPath !== pathString) {
		    var pathShapeValue = '';
		    if (viewData.elem) {
		      if (pathNodes.c) {
		        pathShapeValue = pathData.inv ? this.solidPath + pathString : pathString;
		      }
		      viewData.elem.setAttribute('d', pathShapeValue);
		    }
		    viewData.lastPath = pathString;
		  }
		};

		MaskElement.prototype.destroy = function () {
		  this.element = null;
		  this.globalData = null;
		  this.maskElement = null;
		  this.data = null;
		  this.masksProperties = null;
		};

		/**
		 * @file
		 * Handles AE's layer parenting property.
		 *
		 */

		function HierarchyElement() {}

		HierarchyElement.prototype = {
		  /**
		     * @function
		     * Initializes hierarchy properties
		     *
		     */
		  initHierarchy: function () {
		    // element's parent list
		    this.hierarchy = [];
		    // if element is parent of another layer _isParent will be true
		    this._isParent = false;
		    this.checkParenting();
		  },
		  /**
		     * @function
		     * Sets layer's hierarchy.
		     * @param {array} hierarch
		     * layer's parent list
		     *
		     */
		  setHierarchy: function (hierarchy) {
		    this.hierarchy = hierarchy;
		  },
		  /**
		     * @function
		     * Sets layer as parent.
		     *
		     */
		  setAsParent: function () {
		    this._isParent = true;
		  },
		  /**
		     * @function
		     * Searches layer's parenting chain
		     *
		     */
		  checkParenting: function () {
		    if (this.data.parent !== undefined) {
		      this.comp.buildElementParenting(this, this.data.parent, []);
		    }
		  },
		};

		/**
		 * @file
		 * Handles element's layer frame update.
		 * Checks layer in point and out point
		 *
		 */

		function FrameElement() {}

		FrameElement.prototype = {
		  /**
		     * @function
		     * Initializes frame related properties.
		     *
		     */
		  initFrame: function () {
		    // set to true when inpoint is rendered
		    this._isFirstFrame = false;
		    // list of animated properties
		    this.dynamicProperties = [];
		    // If layer has been modified in current tick this will be true
		    this._mdf = false;
		  },
		  /**
		     * @function
		     * Calculates all dynamic values
		     *
		     * @param {number} num
		     * current frame number in Layer's time
		     * @param {boolean} isVisible
		     * if layers is currently in range
		     *
		     */
		  prepareProperties: function (num, isVisible) {
		    var i;
		    var len = this.dynamicProperties.length;
		    for (i = 0; i < len; i += 1) {
		      if (isVisible || (this._isParent && this.dynamicProperties[i].propType === 'transform')) {
		        this.dynamicProperties[i].getValue();
		        if (this.dynamicProperties[i]._mdf) {
		          this.globalData._mdf = true;
		          this._mdf = true;
		        }
		      }
		    }
		  },
		  addDynamicProperty: function (prop) {
		    if (this.dynamicProperties.indexOf(prop) === -1) {
		      this.dynamicProperties.push(prop);
		    }
		  },
		};

		/* global TransformPropertyFactory, Matrix */

		function TransformElement() {}

		TransformElement.prototype = {
		  initTransform: function () {
		    this.finalTransform = {
		      mProp: this.data.ks ? TransformPropertyFactory.getTransformProperty(this, this.data.ks, this) : { o: 0 },
		      _matMdf: false,
		      _opMdf: false,
		      mat: new Matrix(),
		    };
		    if (this.data.ao) {
		      this.finalTransform.mProp.autoOriented = true;
		    }

		    // TODO: check TYPE 11: Guided elements
		    if (this.data.ty !== 11) ;
		  },
		  renderTransform: function () {
		    this.finalTransform._opMdf = this.finalTransform.mProp.o._mdf || this._isFirstFrame;
		    this.finalTransform._matMdf = this.finalTransform.mProp._mdf || this._isFirstFrame;

		    if (this.hierarchy) {
		      var mat;
		      var finalMat = this.finalTransform.mat;
		      var i = 0;
		      var len = this.hierarchy.length;
		      // Checking if any of the transformation matrices in the hierarchy chain has changed.
		      if (!this.finalTransform._matMdf) {
		        while (i < len) {
		          if (this.hierarchy[i].finalTransform.mProp._mdf) {
		            this.finalTransform._matMdf = true;
		            break;
		          }
		          i += 1;
		        }
		      }

		      if (this.finalTransform._matMdf) {
		        mat = this.finalTransform.mProp.v.props;
		        finalMat.cloneFromProps(mat);
		        for (i = 0; i < len; i += 1) {
		          mat = this.hierarchy[i].finalTransform.mProp.v.props;
		          finalMat.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5], mat[6], mat[7], mat[8], mat[9], mat[10], mat[11], mat[12], mat[13], mat[14], mat[15]);
		        }
		      }
		    }
		  },
		  globalToLocal: function (pt) {
		    var transforms = [];
		    transforms.push(this.finalTransform);
		    var flag = true;
		    var comp = this.comp;
		    while (flag) {
		      if (comp.finalTransform) {
		        if (comp.data.hasMask) {
		          transforms.splice(0, 0, comp.finalTransform);
		        }
		        comp = comp.comp;
		      } else {
		        flag = false;
		      }
		    }
		    var i;
		    var len = transforms.length;
		    var ptNew;
		    for (i = 0; i < len; i += 1) {
		      ptNew = transforms[i].mat.applyToPointArray(0, 0, 0);
		      // ptNew = transforms[i].mat.applyToPointArray(pt[0],pt[1],pt[2]);
		      pt = [pt[0] - ptNew[0], pt[1] - ptNew[1], 0];
		    }
		    return pt;
		  },
		  mHelper: new Matrix(),
		};

		function RenderableElement() {

		}

		RenderableElement.prototype = {
		  initRenderable: function () {
		    // layer's visibility related to inpoint and outpoint. Rename isVisible to isInRange
		    this.isInRange = false;
		    // layer's display state
		    this.hidden = false;
		    // If layer's transparency equals 0, it can be hidden
		    this.isTransparent = false;
		    // list of animated components
		    this.renderableComponents = [];
		  },
		  addRenderableComponent: function (component) {
		    if (this.renderableComponents.indexOf(component) === -1) {
		      this.renderableComponents.push(component);
		    }
		  },
		  removeRenderableComponent: function (component) {
		    if (this.renderableComponents.indexOf(component) !== -1) {
		      this.renderableComponents.splice(this.renderableComponents.indexOf(component), 1);
		    }
		  },
		  prepareRenderableFrame: function (num) {
		    this.checkLayerLimits(num);
		  },
		  checkTransparency: function () {
		    if (this.finalTransform.mProp.o.v <= 0) {
		      if (!this.isTransparent && this.globalData.renderConfig.hideOnTransparent) {
		        this.isTransparent = true;
		        this.hide();
		      }
		    } else if (this.isTransparent) {
		      this.isTransparent = false;
		      this.show();
		    }
		  },
		  /**
		     * @function
		     * Initializes frame related properties.
		     *
		     * @param {number} num
		     * current frame number in Layer's time
		     *
		     */
		  checkLayerLimits: function (num) {
		    if (this.data.ip - this.data.st <= num && this.data.op - this.data.st > num) {
		      if (this.isInRange !== true) {
		        this.globalData._mdf = true;
		        this._mdf = true;
		        this.isInRange = true;
		        this.show();
		      }
		    } else if (this.isInRange !== false) {
		      this.globalData._mdf = true;
		      this.isInRange = false;
		      this.hide();
		    }
		  },
		  renderRenderable: function () {
		    var i;
		    var len = this.renderableComponents.length;
		    for (i = 0; i < len; i += 1) {
		      this.renderableComponents[i].renderFrame(this._isFirstFrame);
		    }
		    /* this.maskManager.renderFrame(this.finalTransform.mat);
		        this.renderableEffectsManager.renderFrame(this._isFirstFrame); */
		  },
		  sourceRectAtTime: function () {
		    return {
		      top: 0,
		      left: 0,
		      width: 100,
		      height: 100,
		    };
		  },
		  getLayerSize: function () {
		    if (this.data.ty === 5) {
		      return { w: this.data.textData.width, h: this.data.textData.height };
		    }
		    return { w: this.data.width, h: this.data.height };
		  },
		};

		/* global extendPrototype, RenderableElement, createProxyFunction */

		function RenderableDOMElement() {}

		(function () {
		  var _prototype = {
		    initElement: function (data, globalData, comp) {
		      this.initFrame();
		      this.initBaseData(data, globalData, comp);
		      this.initTransform(data, globalData, comp);
		      this.initHierarchy();
		      this.initRenderable();
		      this.initRendererElement();
		      this.createContainerElements();
		      this.createRenderableComponents();
		      this.createContent();
		      this.hide();
		    },
		    hide: function () {
		      if (!this.hidden && (!this.isInRange || this.isTransparent)) {
		        var elem = this.baseElement || this.layerElement;
		        elem.style.display = 'none';
		        this.hidden = true;
		      }
		    },
		    show: function () {
		      if (this.isInRange && !this.isTransparent) {
		        if (!this.data.hd) {
		          var elem = this.baseElement || this.layerElement;
		          elem.style.display = 'block';
		        }
		        this.hidden = false;
		        this._isFirstFrame = true;
		      }
		    },
		    renderFrame: function () {
		      // If it is exported as hidden (data.hd === true) no need to render
		      // If it is not visible no need to render
		      if (this.data.hd || this.hidden) {
		        return;
		      }
		      this.renderTransform();
		      this.renderRenderable();
		      this.renderElement();
		      this.renderInnerContent();
		      if (this._isFirstFrame) {
		        this._isFirstFrame = false;
		      }
		    },
		    renderInnerContent: function () {},
		    prepareFrame: function (num) {
		      this._mdf = false;
		      this.prepareRenderableFrame(num);
		      this.prepareProperties(num, this.isInRange);
		      this.checkTransparency();
		    },
		    destroy: function () {
		      this.innerElem = null;
		      this.destroyBaseElement();
		    },
		  };
		  extendPrototype([RenderableElement, createProxyFunction(_prototype)], RenderableDOMElement);
		}());

		/* exported ProcessedElement */

		function ProcessedElement(element, position) {
		  this.elem = element;
		  this.pos = position;
		}

		/* global createNS */

		function SVGStyleData(data, level) {
		  this.data = data;
		  this.type = data.ty;
		  this.d = '';
		  this.lvl = level;
		  this._mdf = false;
		  this.closed = data.hd === true;
		  this.pElem = createNS('path');
		  this.msElem = null;
		}

		SVGStyleData.prototype.reset = function () {
		  this.d = '';
		  this._mdf = false;
		};

		function SVGShapeData(transformers, level, shape) {
		  this.caches = [];
		  this.styles = [];
		  this.transformers = transformers;
		  this.lStr = '';
		  this.sh = shape;
		  this.lvl = level;
		  // TODO find if there are some cases where _isAnimated can be false.
		  // For now, since shapes add up with other shapes. They have to be calculated every time.
		  // One way of finding out is checking if all styles associated to this shape depend only of this shape
		  this._isAnimated = !!shape.k;
		  // TODO: commenting this for now since all shapes are animated
		  var i = 0;
		  var len = transformers.length;
		  while (i < len) {
		    if (transformers[i].mProps.dynamicProperties.length) {
		      this._isAnimated = true;
		      break;
		    }
		    i += 1;
		  }
		}

		SVGShapeData.prototype.setAsAnimated = function () {
		  this._isAnimated = true;
		};

		/* exported SVGTransformData */

		function SVGTransformData(mProps, op, container) {
		  this.transform = {
		    mProps: mProps,
		    op: op,
		    container: container,
		  };
		  this.elements = [];
		  this._isAnimated = this.transform.mProps.dynamicProperties.length || this.transform.op.effectsSequence.length;
		}

		/* global DashProperty, PropertyFactory, extendPrototype, DynamicPropertyContainer */

		function SVGStrokeStyleData(elem, data, styleOb) {
		  this.initDynamicPropertyContainer(elem);
		  this.getValue = this.iterateDynamicProperties;
		  this.o = PropertyFactory.getProp(elem, data.o, 0, 0.01, this);
		  this.w = PropertyFactory.getProp(elem, data.w, 0, null, this);
		  this.d = new DashProperty(elem, data.d || {}, 'svg', this);
		  this.c = PropertyFactory.getProp(elem, data.c, 1, 255, this);
		  this.style = styleOb;
		  this._isAnimated = !!this._isAnimated;
		}

		extendPrototype([DynamicPropertyContainer], SVGStrokeStyleData);

		/* global PropertyFactory, extendPrototype, DynamicPropertyContainer */

		function SVGFillStyleData(elem, data, styleOb) {
		  this.initDynamicPropertyContainer(elem);
		  this.getValue = this.iterateDynamicProperties;
		  this.o = PropertyFactory.getProp(elem, data.o, 0, 0.01, this);
		  this.c = PropertyFactory.getProp(elem, data.c, 1, 255, this);
		  this.style = styleOb;
		}

		extendPrototype([DynamicPropertyContainer], SVGFillStyleData);

		/* global PropertyFactory, degToRads, GradientProperty, createElementID, createNS, locationHref,
		extendPrototype, DynamicPropertyContainer, lineCapEnum, lineJoinEnum */

		function SVGGradientFillStyleData(elem, data, styleOb) {
		  this.initDynamicPropertyContainer(elem);
		  this.getValue = this.iterateDynamicProperties;
		  this.initGradientData(elem, data, styleOb);
		}

		SVGGradientFillStyleData.prototype.initGradientData = function (elem, data, styleOb) {
		  this.o = PropertyFactory.getProp(elem, data.o, 0, 0.01, this);
		  this.s = PropertyFactory.getProp(elem, data.s, 1, null, this);
		  this.e = PropertyFactory.getProp(elem, data.e, 1, null, this);
		  this.h = PropertyFactory.getProp(elem, data.h || { k: 0 }, 0, 0.01, this);
		  this.a = PropertyFactory.getProp(elem, data.a || { k: 0 }, 0, degToRads, this);
		  this.g = new GradientProperty(elem, data.g, this);
		  this.style = styleOb;
		  this.stops = [];
		  this.setGradientData(styleOb.pElem, data);
		  this.setGradientOpacity(data, styleOb);
		  this._isAnimated = !!this._isAnimated;
		};

		SVGGradientFillStyleData.prototype.setGradientData = function (pathElement, data) {
		  var gradientId = createElementID();
		  var gfill = createNS(data.t === 1 ? 'linearGradient' : 'radialGradient');
		  gfill.setAttribute('id', gradientId);
		  gfill.setAttribute('spreadMethod', 'pad');
		  gfill.setAttribute('gradientUnits', 'userSpaceOnUse');
		  var stops = [];
		  var stop;
		  var j;
		  var jLen;
		  jLen = data.g.p * 4;
		  for (j = 0; j < jLen; j += 4) {
		    stop = createNS('stop');
		    gfill.appendChild(stop);
		    stops.push(stop);
		  }
		  pathElement.setAttribute(data.ty === 'gf' ? 'fill' : 'stroke', 'url(' + locationHref + '#' + gradientId + ')');
		  this.gf = gfill;
		  this.cst = stops;
		};

		SVGGradientFillStyleData.prototype.setGradientOpacity = function (data, styleOb) {
		  if (this.g._hasOpacity && !this.g._collapsable) {
		    var stop;
		    var j;
		    var jLen;
		    var mask = createNS('mask');
		    var maskElement = createNS('path');
		    mask.appendChild(maskElement);
		    var opacityId = createElementID();
		    var maskId = createElementID();
		    mask.setAttribute('id', maskId);
		    var opFill = createNS(data.t === 1 ? 'linearGradient' : 'radialGradient');
		    opFill.setAttribute('id', opacityId);
		    opFill.setAttribute('spreadMethod', 'pad');
		    opFill.setAttribute('gradientUnits', 'userSpaceOnUse');
		    jLen = data.g.k.k[0].s ? data.g.k.k[0].s.length : data.g.k.k.length;
		    var stops = this.stops;
		    for (j = data.g.p * 4; j < jLen; j += 2) {
		      stop = createNS('stop');
		      stop.setAttribute('stop-color', 'rgb(255,255,255)');
		      opFill.appendChild(stop);
		      stops.push(stop);
		    }
		    maskElement.setAttribute(data.ty === 'gf' ? 'fill' : 'stroke', 'url(' + locationHref + '#' + opacityId + ')');
		    if (data.ty === 'gs') {
		      maskElement.setAttribute('stroke-linecap', lineCapEnum[data.lc || 2]);
		      maskElement.setAttribute('stroke-linejoin', lineJoinEnum[data.lj || 2]);
		      if (data.lj === 1) {
		        maskElement.setAttribute('stroke-miterlimit', data.ml);
		      }
		    }
		    this.of = opFill;
		    this.ms = mask;
		    this.ost = stops;
		    this.maskId = maskId;
		    styleOb.msElem = maskElement;
		  }
		};

		extendPrototype([DynamicPropertyContainer], SVGGradientFillStyleData);

		/* global PropertyFactory, DashProperty, extendPrototype, SVGGradientFillStyleData, DynamicPropertyContainer */

		function SVGGradientStrokeStyleData(elem, data, styleOb) {
		  this.initDynamicPropertyContainer(elem);
		  this.getValue = this.iterateDynamicProperties;
		  this.w = PropertyFactory.getProp(elem, data.w, 0, null, this);
		  this.d = new DashProperty(elem, data.d || {}, 'svg', this);
		  this.initGradientData(elem, data, styleOb);
		  this._isAnimated = !!this._isAnimated;
		}

		extendPrototype([SVGGradientFillStyleData, DynamicPropertyContainer], SVGGradientStrokeStyleData);

		/* global createNS */
		/* exported ShapeGroupData */

		function ShapeGroupData() {
		  this.it = [];
		  this.prevViewData = [];
		  this.gr = createNS('g');
		}

		/* global Matrix, buildShapeString, bmFloor */
		/* exported SVGElementsRenderer */

		var SVGElementsRenderer = (function () {
		  var _identityMatrix = new Matrix();
		  var _matrixHelper = new Matrix();

		  var ob = {
		    createRenderFunction: createRenderFunction,
		  };

		  function createRenderFunction(data) {
		    switch (data.ty) {
		      case 'fl':
		        return renderFill;
		      case 'gf':
		        return renderGradient;
		      case 'gs':
		        return renderGradientStroke;
		      case 'st':
		        return renderStroke;
		      case 'sh':
		      case 'el':
		      case 'rc':
		      case 'sr':
		        return renderPath;
		      case 'tr':
		        return renderContentTransform;
		      default:
		        return null;
		    }
		  }

		  function renderContentTransform(styleData, itemData, isFirstFrame) {
		    if (isFirstFrame || itemData.transform.op._mdf) {
		      itemData.transform.container.setAttribute('opacity', itemData.transform.op.v);
		    }
		    if (isFirstFrame || itemData.transform.mProps._mdf) {
		      itemData.transform.container.setAttribute('transform', itemData.transform.mProps.v.to2dCSS());
		    }
		  }

		  function renderPath(styleData, itemData, isFirstFrame) {
		    var j;
		    var jLen;
		    var pathStringTransformed;
		    var redraw;
		    var pathNodes;
		    var l;
		    var lLen = itemData.styles.length;
		    var lvl = itemData.lvl;
		    var paths;
		    var mat;
		    var props;
		    var iterations;
		    var k;
		    for (l = 0; l < lLen; l += 1) {
		      redraw = itemData.sh._mdf || isFirstFrame;
		      if (itemData.styles[l].lvl < lvl) {
		        mat = _matrixHelper.reset();
		        iterations = lvl - itemData.styles[l].lvl;
		        k = itemData.transformers.length - 1;
		        while (!redraw && iterations > 0) {
		          redraw = itemData.transformers[k].mProps._mdf || redraw;
		          iterations -= 1;
		          k -= 1;
		        }
		        if (redraw) {
		          iterations = lvl - itemData.styles[l].lvl;
		          k = itemData.transformers.length - 1;
		          while (iterations > 0) {
		            props = itemData.transformers[k].mProps.v.props;
		            mat.transform(props[0], props[1], props[2], props[3], props[4], props[5], props[6], props[7], props[8], props[9], props[10], props[11], props[12], props[13], props[14], props[15]);
		            iterations -= 1;
		            k -= 1;
		          }
		        }
		      } else {
		        mat = _identityMatrix;
		      }
		      paths = itemData.sh.paths;
		      jLen = paths._length;
		      if (redraw) {
		        pathStringTransformed = '';
		        for (j = 0; j < jLen; j += 1) {
		          pathNodes = paths.shapes[j];
		          if (pathNodes && pathNodes._length) {
		            pathStringTransformed += buildShapeString(pathNodes, pathNodes._length, pathNodes.c, mat);
		          }
		        }
		        itemData.caches[l] = pathStringTransformed;
		      } else {
		        pathStringTransformed = itemData.caches[l];
		      }
		      itemData.styles[l].d += styleData.hd === true ? '' : pathStringTransformed;
		      itemData.styles[l]._mdf = redraw || itemData.styles[l]._mdf;
		    }
		  }

		  function renderFill(styleData, itemData, isFirstFrame) {
		    var styleElem = itemData.style;

		    if (itemData.c._mdf || isFirstFrame) {
		      styleElem.pElem.setAttribute('fill', 'rgb(' + bmFloor(itemData.c.v[0]) + ',' + bmFloor(itemData.c.v[1]) + ',' + bmFloor(itemData.c.v[2]) + ')');
		    }
		    if (itemData.o._mdf || isFirstFrame) {
		      styleElem.pElem.setAttribute('fill-opacity', itemData.o.v);
		    }
		  }

		  function renderGradientStroke(styleData, itemData, isFirstFrame) {
		    renderGradient(styleData, itemData, isFirstFrame);
		    renderStroke(styleData, itemData, isFirstFrame);
		  }

		  function renderGradient(styleData, itemData, isFirstFrame) {
		    var gfill = itemData.gf;
		    var hasOpacity = itemData.g._hasOpacity;
		    var pt1 = itemData.s.v;
		    var pt2 = itemData.e.v;

		    if (itemData.o._mdf || isFirstFrame) {
		      var attr = styleData.ty === 'gf' ? 'fill-opacity' : 'stroke-opacity';
		      itemData.style.pElem.setAttribute(attr, itemData.o.v);
		    }
		    if (itemData.s._mdf || isFirstFrame) {
		      var attr1 = styleData.t === 1 ? 'x1' : 'cx';
		      var attr2 = attr1 === 'x1' ? 'y1' : 'cy';
		      gfill.setAttribute(attr1, pt1[0]);
		      gfill.setAttribute(attr2, pt1[1]);
		      if (hasOpacity && !itemData.g._collapsable) {
		        itemData.of.setAttribute(attr1, pt1[0]);
		        itemData.of.setAttribute(attr2, pt1[1]);
		      }
		    }
		    var stops;
		    var i;
		    var len;
		    var stop;
		    if (itemData.g._cmdf || isFirstFrame) {
		      stops = itemData.cst;
		      var cValues = itemData.g.c;
		      len = stops.length;
		      for (i = 0; i < len; i += 1) {
		        stop = stops[i];
		        stop.setAttribute('offset', cValues[i * 4] + '%');
		        stop.setAttribute('stop-color', 'rgb(' + cValues[i * 4 + 1] + ',' + cValues[i * 4 + 2] + ',' + cValues[i * 4 + 3] + ')');
		      }
		    }
		    if (hasOpacity && (itemData.g._omdf || isFirstFrame)) {
		      var oValues = itemData.g.o;
		      if (itemData.g._collapsable) {
		        stops = itemData.cst;
		      } else {
		        stops = itemData.ost;
		      }
		      len = stops.length;
		      for (i = 0; i < len; i += 1) {
		        stop = stops[i];
		        if (!itemData.g._collapsable) {
		          stop.setAttribute('offset', oValues[i * 2] + '%');
		        }
		        stop.setAttribute('stop-opacity', oValues[i * 2 + 1]);
		      }
		    }
		    if (styleData.t === 1) {
		      if (itemData.e._mdf || isFirstFrame) {
		        gfill.setAttribute('x2', pt2[0]);
		        gfill.setAttribute('y2', pt2[1]);
		        if (hasOpacity && !itemData.g._collapsable) {
		          itemData.of.setAttribute('x2', pt2[0]);
		          itemData.of.setAttribute('y2', pt2[1]);
		        }
		      }
		    } else {
		      var rad;
		      if (itemData.s._mdf || itemData.e._mdf || isFirstFrame) {
		        rad = Math.sqrt(Math.pow(pt1[0] - pt2[0], 2) + Math.pow(pt1[1] - pt2[1], 2));
		        gfill.setAttribute('r', rad);
		        if (hasOpacity && !itemData.g._collapsable) {
		          itemData.of.setAttribute('r', rad);
		        }
		      }
		      if (itemData.e._mdf || itemData.h._mdf || itemData.a._mdf || isFirstFrame) {
		        if (!rad) {
		          rad = Math.sqrt(Math.pow(pt1[0] - pt2[0], 2) + Math.pow(pt1[1] - pt2[1], 2));
		        }
		        var ang = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]);

		        var percent = itemData.h.v;
		        if (percent >= 1) {
		          percent = 0.99;
		        } else if (percent <= -1) {
		          percent = -0.99;
		        }
		        var dist = rad * percent;
		        var x = Math.cos(ang + itemData.a.v) * dist + pt1[0];
		        var y = Math.sin(ang + itemData.a.v) * dist + pt1[1];
		        gfill.setAttribute('fx', x);
		        gfill.setAttribute('fy', y);
		        if (hasOpacity && !itemData.g._collapsable) {
		          itemData.of.setAttribute('fx', x);
		          itemData.of.setAttribute('fy', y);
		        }
		      }
		      // gfill.setAttribute('fy','200');
		    }
		  }

		  function renderStroke(styleData, itemData, isFirstFrame) {
		    var styleElem = itemData.style;
		    var d = itemData.d;
		    if (d && (d._mdf || isFirstFrame) && d.dashStr) {
		      styleElem.pElem.setAttribute('stroke-dasharray', d.dashStr);
		      styleElem.pElem.setAttribute('stroke-dashoffset', d.dashoffset[0]);
		    }
		    if (itemData.c && (itemData.c._mdf || isFirstFrame)) {
		      styleElem.pElem.setAttribute('stroke', 'rgb(' + bmFloor(itemData.c.v[0]) + ',' + bmFloor(itemData.c.v[1]) + ',' + bmFloor(itemData.c.v[2]) + ')');
		    }
		    if (itemData.o._mdf || isFirstFrame) {
		      styleElem.pElem.setAttribute('stroke-opacity', itemData.o.v);
		    }
		    if (itemData.w._mdf || isFirstFrame) {
		      styleElem.pElem.setAttribute('stroke-width', itemData.w.v);
		      if (styleElem.msElem) {
		        styleElem.msElem.setAttribute('stroke-width', itemData.w.v);
		      }
		    }
		  }

		  return ob;
		}());

		/* global LayerExpressionInterface, EffectsExpressionInterface, CompExpressionInterface, ShapeExpressionInterface,
		TextExpressionInterface, getBlendMode,createElementID, EffectsManager */

		function BaseElement() {
		}

		BaseElement.prototype = {
		  checkMasks: function () {
		    if (!this.data.hasMask) {
		      return false;
		    }
		    var i = 0;
		    var len = this.data.masksProperties.length;
		    while (i < len) {
		      if ((this.data.masksProperties[i].mode !== 'n' && this.data.masksProperties[i].cl !== false)) {
		        return true;
		      }
		      i += 1;
		    }
		    return false;
		  },
		  initExpressions: function () {
		    this.layerInterface = LayerExpressionInterface(this);
		    if (this.data.hasMask && this.maskManager) {
		      this.layerInterface.registerMaskInterface(this.maskManager);
		    }
		    var effectsInterface = EffectsExpressionInterface.createEffectsInterface(this, this.layerInterface);
		    this.layerInterface.registerEffectsInterface(effectsInterface);

		    if (this.data.ty === 0 || this.data.xt) {
		      this.compInterface = CompExpressionInterface(this);
		    } else if (this.data.ty === 4) {
		      this.layerInterface.shapeInterface = ShapeExpressionInterface(this.shapesData, this.itemsData, this.layerInterface);
		      this.layerInterface.content = this.layerInterface.shapeInterface;
		    } else if (this.data.ty === 5) {
		      this.layerInterface.textInterface = TextExpressionInterface(this);
		      this.layerInterface.text = this.layerInterface.textInterface;
		    }
		  },
		  setBlendMode: function () {
		    var blendModeValue = getBlendMode(this.data.bm);
		    var elem = this.baseElement || this.layerElement;

		    elem.style['mix-blend-mode'] = blendModeValue;
		  },
		  initBaseData: function (data, globalData, comp) {
		    this.globalData = globalData;
		    this.comp = comp;
		    this.data = data;
		    this.layerId = createElementID();

		    // Stretch factor for old animations missing this property.
		    if (!this.data.sr) {
		      this.data.sr = 1;
		    }
		    // effects manager
		    this.effectsManager = new EffectsManager(this.data, this, this.dynamicProperties);
		  },
		  getType: function () {
		    return this.type;
		  },
		  sourceRectAtTime: function () {},
		};

		/* global extendPrototype, BaseElement, TransformElement, HierarchyElement, FrameElement */

		function NullElement(data, globalData, comp) {
		  this.initFrame();
		  this.initBaseData(data, globalData, comp);
		  this.initFrame();
		  this.initTransform(data, globalData, comp);
		  this.initHierarchy();
		}

		NullElement.prototype.prepareFrame = function (num) {
		  this.prepareProperties(num, true);
		};

		NullElement.prototype.renderFrame = function () {
		};

		NullElement.prototype.getBaseElement = function () {
		  return null;
		};

		NullElement.prototype.destroy = function () {
		};

		NullElement.prototype.sourceRectAtTime = function () {
		};

		NullElement.prototype.hide = function () {
		};

		extendPrototype([BaseElement, TransformElement, HierarchyElement, FrameElement], NullElement);

		/* global filtersFactory, featureSupport, filtersFactory, createElementID, createNS, MaskElement, SVGEffects, locationHref */

		function SVGBaseElement() {
		}

		SVGBaseElement.prototype = {
		  initRendererElement: function () {
		    this.layerElement = createNS('g');
		  },
		  createContainerElements: function () {
		    this.matteElement = createNS('g');
		    this.transformedElement = this.layerElement;
		    this.maskedElement = this.layerElement;
		    this._sizeChanged = false;
		    var layerElementParent = null;
		    // If this layer acts as a mask for the following layer
		    var filId;
		    var fil;
		    var gg;
		    if (this.data.td) {
		      if (this.data.td == 3 || this.data.td == 1) { // eslint-disable-line eqeqeq
		        var masker = createNS('mask');
		        masker.setAttribute('id', this.layerId);
		        masker.setAttribute('mask-type', this.data.td == 3 ? 'luminance' : 'alpha'); // eslint-disable-line eqeqeq
		        masker.appendChild(this.layerElement);
		        layerElementParent = masker;
		        this.globalData.defs.appendChild(masker);
		        // This is only for IE and Edge when mask if of type alpha
		        if (!featureSupport.maskType && this.data.td == 1) { // eslint-disable-line eqeqeq
		          masker.setAttribute('mask-type', 'luminance');
		          filId = createElementID();
		          fil = filtersFactory.createFilter(filId);
		          this.globalData.defs.appendChild(fil);
		          fil.appendChild(filtersFactory.createAlphaToLuminanceFilter());
		          gg = createNS('g');
		          gg.appendChild(this.layerElement);
		          layerElementParent = gg;
		          masker.appendChild(gg);
		          gg.setAttribute('filter', 'url(' + locationHref + '#' + filId + ')');
		        }
		      } else if (this.data.td == 2) { // eslint-disable-line eqeqeq
		        var maskGroup = createNS('mask');
		        maskGroup.setAttribute('id', this.layerId);
		        maskGroup.setAttribute('mask-type', 'alpha');
		        var maskGrouper = createNS('g');
		        maskGroup.appendChild(maskGrouper);
		        filId = createElementID();
		        fil = filtersFactory.createFilter(filId);
		        /// /

		        // This solution doesn't work on Android when meta tag with viewport attribute is set
		        /* var feColorMatrix = createNS('feColorMatrix');
		                feColorMatrix.setAttribute('type', 'matrix');
		                feColorMatrix.setAttribute('color-interpolation-filters', 'sRGB');
		                feColorMatrix.setAttribute('values','1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 -1 1');
		                fil.appendChild(feColorMatrix); */
		        /// /
		        var feCTr = createNS('feComponentTransfer');
		        feCTr.setAttribute('in', 'SourceGraphic');
		        fil.appendChild(feCTr);
		        var feFunc = createNS('feFuncA');
		        feFunc.setAttribute('type', 'table');
		        feFunc.setAttribute('tableValues', '1.0 0.0');
		        feCTr.appendChild(feFunc);
		        /// /
		        this.globalData.defs.appendChild(fil);
		        var alphaRect = createNS('rect');
		        alphaRect.setAttribute('width', this.comp.data.w);
		        alphaRect.setAttribute('height', this.comp.data.h);
		        alphaRect.setAttribute('x', '0');
		        alphaRect.setAttribute('y', '0');
		        alphaRect.setAttribute('fill', '#ffffff');
		        alphaRect.setAttribute('opacity', '0');
		        maskGrouper.setAttribute('filter', 'url(' + locationHref + '#' + filId + ')');
		        maskGrouper.appendChild(alphaRect);
		        maskGrouper.appendChild(this.layerElement);
		        layerElementParent = maskGrouper;
		        if (!featureSupport.maskType) {
		          maskGroup.setAttribute('mask-type', 'luminance');
		          fil.appendChild(filtersFactory.createAlphaToLuminanceFilter());
		          gg = createNS('g');
		          maskGrouper.appendChild(alphaRect);
		          gg.appendChild(this.layerElement);
		          layerElementParent = gg;
		          maskGrouper.appendChild(gg);
		        }
		        this.globalData.defs.appendChild(maskGroup);
		      }
		    } else if (this.data.tt) {
		      this.matteElement.appendChild(this.layerElement);
		      layerElementParent = this.matteElement;
		      this.baseElement = this.matteElement;
		    } else {
		      this.baseElement = this.layerElement;
		    }
		    if (this.data.ln) {
		      this.layerElement.setAttribute('id', this.data.ln);
		    }
		    if (this.data.cl) {
		      this.layerElement.setAttribute('class', this.data.cl);
		    }
		    // Clipping compositions to hide content that exceeds boundaries. If collapsed transformations is on, component should not be clipped
		    if (this.data.ty === 0 && !this.data.hd) {
		      var cp = createNS('clipPath');
		      var pt = createNS('path');
		      pt.setAttribute('d', 'M0,0 L' + this.data.w + ',0 L' + this.data.w + ',' + this.data.h + ' L0,' + this.data.h + 'z');
		      var clipId = createElementID();
		      cp.setAttribute('id', clipId);
		      cp.appendChild(pt);
		      this.globalData.defs.appendChild(cp);

		      if (this.checkMasks()) {
		        var cpGroup = createNS('g');
		        cpGroup.setAttribute('clip-path', 'url(' + locationHref + '#' + clipId + ')');
		        cpGroup.appendChild(this.layerElement);
		        this.transformedElement = cpGroup;
		        if (layerElementParent) {
		          layerElementParent.appendChild(this.transformedElement);
		        } else {
		          this.baseElement = this.transformedElement;
		        }
		      } else {
		        this.layerElement.setAttribute('clip-path', 'url(' + locationHref + '#' + clipId + ')');
		      }
		    }
		    if (this.data.bm !== 0) {
		      this.setBlendMode();
		    }
		  },
		  renderElement: function () {
		    if (this.finalTransform._matMdf) {
		      this.transformedElement.setAttribute('transform', this.finalTransform.mat.to2dCSS());
		    }
		    if (this.finalTransform._opMdf) {
		      this.transformedElement.setAttribute('opacity', this.finalTransform.mProp.o.v);
		    }
		  },
		  destroyBaseElement: function () {
		    this.layerElement = null;
		    this.matteElement = null;
		    this.maskManager.destroy();
		  },
		  getBaseElement: function () {
		    if (this.data.hd) {
		      return null;
		    }
		    return this.baseElement;
		  },
		  createRenderableComponents: function () {
		    this.maskManager = new MaskElement(this.data, this, this.globalData);
		    this.renderableEffectsManager = new SVGEffects();
		  },
		  setMatte: function (id) {
		    if (!this.matteElement) {
		      return;
		    }
		    this.matteElement.setAttribute('mask', 'url(' + locationHref + '#' + id + ')');
		  },
		};

		/* global ProcessedElement */

		function IShapeElement() {
		}

		IShapeElement.prototype = {
		  addShapeToModifiers: function (data) {
		    var i;
		    var len = this.shapeModifiers.length;
		    for (i = 0; i < len; i += 1) {
		      this.shapeModifiers[i].addShape(data);
		    }
		  },
		  isShapeInAnimatedModifiers: function (data) {
		    var i = 0;
		    var len = this.shapeModifiers.length;
		    while (i < len) {
		      if (this.shapeModifiers[i].isAnimatedWithShape(data)) {
		        return true;
		      }
		    }
		    return false;
		  },
		  renderModifiers: function () {
		    if (!this.shapeModifiers.length) {
		      return;
		    }
		    var i;
		    var len = this.shapes.length;
		    for (i = 0; i < len; i += 1) {
		      this.shapes[i].sh.reset();
		    }

		    len = this.shapeModifiers.length;
		    var shouldBreakProcess;
		    for (i = len - 1; i >= 0; i -= 1) {
		      shouldBreakProcess = this.shapeModifiers[i].processShapes(this._isFirstFrame);
		      // workaround to fix cases where a repeater resets the shape so the following processes get called twice
		      // TODO: find a better solution for this
		      if (shouldBreakProcess) {
		        break;
		      }
		    }
		  },

		  searchProcessedElement: function (elem) {
		    var elements = this.processedElements;
		    var i = 0;
		    var len = elements.length;
		    while (i < len) {
		      if (elements[i].elem === elem) {
		        return elements[i].pos;
		      }
		      i += 1;
		    }
		    return 0;
		  },
		  addProcessedElement: function (elem, pos) {
		    var elements = this.processedElements;
		    var i = elements.length;
		    while (i) {
		      i -= 1;
		      if (elements[i].elem === elem) {
		        elements[i].pos = pos;
		        return;
		      }
		    }
		    elements.push(new ProcessedElement(elem, pos));
		  },
		  prepareFrame: function (num) {
		    this.prepareRenderableFrame(num);
		    this.prepareProperties(num, this.isInRange);
		  },
		};

		/* global TextProperty, TextAnimatorProperty, buildShapeString, LetterProps */

		function ITextElement() {
		}

		ITextElement.prototype.initElement = function (data, globalData, comp) {
		  this.lettersChangedFlag = true;
		  this.initFrame();
		  this.initBaseData(data, globalData, comp);
		  this.textProperty = new TextProperty(this, data.t, this.dynamicProperties);
		  this.textAnimator = new TextAnimatorProperty(data.t, this.renderType, this);
		  this.initTransform(data, globalData, comp);
		  this.initHierarchy();
		  this.initRenderable();
		  this.initRendererElement();
		  this.createContainerElements();
		  this.createRenderableComponents();
		  this.createContent();
		  this.hide();
		  this.textAnimator.searchProperties(this.dynamicProperties);
		};

		ITextElement.prototype.prepareFrame = function (num) {
		  this._mdf = false;
		  this.prepareRenderableFrame(num);
		  this.prepareProperties(num, this.isInRange);
		  if (this.textProperty._mdf || this.textProperty._isFirstFrame) {
		    this.buildNewText();
		    this.textProperty._isFirstFrame = false;
		    this.textProperty._mdf = false;
		  }
		};

		ITextElement.prototype.createPathShape = function (matrixHelper, shapes) {
		  var j;
		  var jLen = shapes.length;
		  var pathNodes;
		  var shapeStr = '';
		  for (j = 0; j < jLen; j += 1) {
		    pathNodes = shapes[j].ks.k;
		    shapeStr += buildShapeString(pathNodes, pathNodes.i.length, true, matrixHelper);
		  }
		  return shapeStr;
		};

		ITextElement.prototype.updateDocumentData = function (newData, index) {
		  this.textProperty.updateDocumentData(newData, index);
		};

		ITextElement.prototype.canResizeFont = function (_canResize) {
		  this.textProperty.canResizeFont(_canResize);
		};

		ITextElement.prototype.setMinimumFontSize = function (_fontSize) {
		  this.textProperty.setMinimumFontSize(_fontSize);
		};

		ITextElement.prototype.applyTextPropertiesToMatrix = function (documentData, matrixHelper, lineNumber, xPos, yPos) {
		  if (documentData.ps) {
		    matrixHelper.translate(documentData.ps[0], documentData.ps[1] + documentData.ascent, 0);
		  }
		  matrixHelper.translate(0, -documentData.ls, 0);
		  switch (documentData.j) {
		    case 1:
		      matrixHelper.translate(documentData.justifyOffset + (documentData.boxWidth - documentData.lineWidths[lineNumber]), 0, 0);
		      break;
		    case 2:
		      matrixHelper.translate(documentData.justifyOffset + (documentData.boxWidth - documentData.lineWidths[lineNumber]) / 2, 0, 0);
		      break;
		  }
		  matrixHelper.translate(xPos, yPos, 0);
		};

		ITextElement.prototype.buildColor = function (colorData) {
		  return 'rgb(' + Math.round(colorData[0] * 255) + ',' + Math.round(colorData[1] * 255) + ',' + Math.round(colorData[2] * 255) + ')';
		};

		ITextElement.prototype.emptyProp = new LetterProps();

		ITextElement.prototype.destroy = function () {

		};

		/* global extendPrototype, BaseElement, TransformElement, HierarchyElement, FrameElement, RenderableDOMElement */

		function ICompElement() {}

		extendPrototype([BaseElement, TransformElement, HierarchyElement, FrameElement, RenderableDOMElement], ICompElement);

		ICompElement.prototype.initElement = function (data, globalData, comp) {
		  this.initFrame();
		  this.initBaseData(data, globalData, comp);
		  this.initTransform(data, globalData, comp);
		  this.initRenderable();
		  this.initHierarchy();
		  this.initRendererElement();
		  this.createContainerElements();
		  this.createRenderableComponents();
		  if (this.data.xt || !globalData.progressiveLoad) {
		    this.buildAllItems();
		  }
		  this.hide();
		};

		/* ICompElement.prototype.hide = function(){
		    if(!this.hidden){
		        this.hideElement();
		        var i,len = this.elements.length;
		        for( i = 0; i < len; i+=1 ){
		            if(this.elements[i]){
		                this.elements[i].hide();
		            }
		        }
		    }
		}; */

		ICompElement.prototype.prepareFrame = function (num) {
		  this._mdf = false;
		  this.prepareRenderableFrame(num);
		  this.prepareProperties(num, this.isInRange);
		  if (!this.isInRange && !this.data.xt) {
		    return;
		  }

		  if (!this.tm._placeholder) {
		    var timeRemapped = this.tm.v;
		    if (timeRemapped === this.data.op) {
		      timeRemapped = this.data.op - 1;
		    }
		    this.renderedFrame = timeRemapped;
		  } else {
		    this.renderedFrame = num / this.data.sr;
		  }
		  var i;
		  var len = this.elements.length;
		  if (!this.completeLayers) {
		    this.checkLayers(this.renderedFrame);
		  }
		  // This iteration needs to be backwards because of how expressions connect between each other
		  for (i = len - 1; i >= 0; i -= 1) {
		    if (this.completeLayers || this.elements[i]) {
		      this.elements[i].prepareFrame(this.renderedFrame - this.layers[i].st);
		      if (this.elements[i]._mdf) {
		        this._mdf = true;
		      }
		    }
		  }
		};

		ICompElement.prototype.renderInnerContent = function () {
		  var i;
		  var len = this.layers.length;
		  for (i = 0; i < len; i += 1) {
		    if (this.completeLayers || this.elements[i]) {
		      this.elements[i].renderFrame();
		    }
		  }
		};

		ICompElement.prototype.setElements = function (elems) {
		  this.elements = elems;
		};

		ICompElement.prototype.getElements = function () {
		  return this.elements;
		};

		ICompElement.prototype.destroyElements = function () {
		  var i;
		  var len = this.layers.length;
		  for (i = 0; i < len; i += 1) {
		    if (this.elements[i]) {
		      this.elements[i].destroy();
		    }
		  }
		};

		ICompElement.prototype.destroy = function () {
		  this.destroyElements();
		  this.destroyBaseElement();
		};

		/* global extendPrototype, BaseElement, TransformElement, SVGBaseElement, HierarchyElement, FrameElement, RenderableDOMElement, createNS */

		function IImageElement(data, globalData, comp) {
		  this.assetData = globalData.getAssetData(data.refId);
		  this.initElement(data, globalData, comp);
		  this.sourceRect = {
		    top: 0, left: 0, width: this.assetData.w, height: this.assetData.h,
		  };
		}

		extendPrototype([BaseElement, TransformElement, SVGBaseElement, HierarchyElement, FrameElement, RenderableDOMElement], IImageElement);

		IImageElement.prototype.createContent = function () {
		  var assetPath = this.globalData.getAssetsPath(this.assetData);

		  this.innerElem = createNS('image');
		  this.innerElem.setAttribute('width', this.assetData.w + 'px');
		  this.innerElem.setAttribute('height', this.assetData.h + 'px');
		  this.innerElem.setAttribute('preserveAspectRatio', this.assetData.pr || this.globalData.renderConfig.imagePreserveAspectRatio);
		  this.innerElem.setAttributeNS('http://www.w3.org/1999/xlink', 'href', assetPath);

		  this.layerElement.appendChild(this.innerElem);
		};

		IImageElement.prototype.sourceRectAtTime = function () {
		  return this.sourceRect;
		};

		/* global extendPrototype, IImageElement, createNS */

		function ISolidElement(data, globalData, comp) {
		  this.initElement(data, globalData, comp);
		}
		extendPrototype([IImageElement], ISolidElement);

		ISolidElement.prototype.createContent = function () {
		  var rect = createNS('rect');
		  /// /rect.style.width = this.data.sw;
		  /// /rect.style.height = this.data.sh;
		  /// /rect.style.fill = this.data.sc;
		  rect.setAttribute('width', this.data.sw);
		  rect.setAttribute('height', this.data.sh);
		  rect.setAttribute('fill', this.data.sc);
		  this.layerElement.appendChild(rect);
		};

		/* global PropertyFactory, extendPrototype, RenderableElement, BaseElement, FrameElement */

		function AudioElement(data, globalData, comp) {
		  this.initFrame();
		  this.initRenderable();
		  this.assetData = globalData.getAssetData(data.refId);
		  this.initBaseData(data, globalData, comp);
		  this._isPlaying = false;
		  this._canPlay = false;
		  var assetPath = this.globalData.getAssetsPath(this.assetData);
		  this.audio = this.globalData.audioController.createAudio(assetPath);
		  this._currentTime = 0;
		  this.globalData.audioController.addAudio(this);
		  this.tm = data.tm ? PropertyFactory.getProp(this, data.tm, 0, globalData.frameRate, this) : { _placeholder: true };
		}

		AudioElement.prototype.prepareFrame = function (num) {
		  this.prepareRenderableFrame(num, true);
		  this.prepareProperties(num, true);
		  if (!this.tm._placeholder) {
		    var timeRemapped = this.tm.v;
		    this._currentTime = timeRemapped;
		  } else {
		    this._currentTime = num / this.data.sr;
		  }
		};

		extendPrototype([RenderableElement, BaseElement, FrameElement], AudioElement);

		AudioElement.prototype.renderFrame = function () {
		  if (this.isInRange && this._canPlay) {
		    if (!this._isPlaying) {
		      this.audio.play();
		      this.audio.seek(this._currentTime / this.globalData.frameRate);
		      this._isPlaying = true;
		    } else if (!this.audio.playing()
		      || Math.abs(this._currentTime / this.globalData.frameRate - this.audio.seek()) > 0.1
		    ) {
		      this.audio.seek(this._currentTime / this.globalData.frameRate);
		    }
		  }
		};

		AudioElement.prototype.show = function () {
		  // this.audio.play()
		};

		AudioElement.prototype.hide = function () {
		  this.audio.pause();
		  this._isPlaying = false;
		};

		AudioElement.prototype.pause = function () {
		  this.audio.pause();
		  this._isPlaying = false;
		  this._canPlay = false;
		};

		AudioElement.prototype.resume = function () {
		  this._canPlay = true;
		};

		AudioElement.prototype.setRate = function (rateValue) {
		  this.audio.rate(rateValue);
		};

		AudioElement.prototype.volume = function (volumeValue) {
		  this.audio.volume(volumeValue);
		};

		AudioElement.prototype.getBaseElement = function () {
		  return null;
		};

		AudioElement.prototype.destroy = function () {
		};

		AudioElement.prototype.sourceRectAtTime = function () {
		};

		AudioElement.prototype.initExpressions = function () {
		};

		/* global createSizedArray, PropertyFactory, extendPrototype, SVGRenderer, ICompElement, SVGBaseElement */

		function SVGCompElement(data, globalData, comp) {
		  this.layers = data.layers;
		  this.supports3d = true;
		  this.completeLayers = false;
		  this.pendingElements = [];
		  this.elements = this.layers ? createSizedArray(this.layers.length) : [];
		  // this.layerElement = createNS('g');
		  this.initElement(data, globalData, comp);
		  this.tm = data.tm ? PropertyFactory.getProp(this, data.tm, 0, globalData.frameRate, this) : { _placeholder: true };
		}

		extendPrototype([SVGRenderer, ICompElement, SVGBaseElement], SVGCompElement);

		/* global extendPrototype, BaseElement, TransformElement, SVGBaseElement, HierarchyElement, FrameElement,
		RenderableDOMElement, ITextElement, createSizedArray, createNS */

		function SVGTextLottieElement(data, globalData, comp) {
		  this.textSpans = [];
		  this.renderType = 'svg';
		  this.initElement(data, globalData, comp);
		}

		extendPrototype([BaseElement, TransformElement, SVGBaseElement, HierarchyElement, FrameElement, RenderableDOMElement, ITextElement], SVGTextLottieElement);

		SVGTextLottieElement.prototype.createContent = function () {
		  if (this.data.singleShape && !this.globalData.fontManager.chars) {
		    this.textContainer = createNS('text');
		  }
		};

		SVGTextLottieElement.prototype.buildTextContents = function (textArray) {
		  var i = 0;
		  var len = textArray.length;
		  var textContents = [];
		  var currentTextContent = '';
		  while (i < len) {
		    if (textArray[i] === String.fromCharCode(13) || textArray[i] === String.fromCharCode(3)) {
		      textContents.push(currentTextContent);
		      currentTextContent = '';
		    } else {
		      currentTextContent += textArray[i];
		    }
		    i += 1;
		  }
		  textContents.push(currentTextContent);
		  return textContents;
		};

		SVGTextLottieElement.prototype.buildNewText = function () {
		  var i;
		  var len;

		  var documentData = this.textProperty.currentData;
		  this.renderedLetters = createSizedArray(documentData ? documentData.l.length : 0);
		  if (documentData.fc) {
		    this.layerElement.setAttribute('fill', this.buildColor(documentData.fc));
		  } else {
		    this.layerElement.setAttribute('fill', 'rgba(0,0,0,0)');
		  }
		  if (documentData.sc) {
		    this.layerElement.setAttribute('stroke', this.buildColor(documentData.sc));
		    this.layerElement.setAttribute('stroke-width', documentData.sw);
		  }
		  this.layerElement.setAttribute('font-size', documentData.finalSize);
		  var fontData = this.globalData.fontManager.getFontByName(documentData.f);
		  if (fontData.fClass) {
		    this.layerElement.setAttribute('class', fontData.fClass);
		  } else {
		    this.layerElement.setAttribute('font-family', fontData.fFamily);
		    var fWeight = documentData.fWeight;
		    var fStyle = documentData.fStyle;
		    this.layerElement.setAttribute('font-style', fStyle);
		    this.layerElement.setAttribute('font-weight', fWeight);
		  }
		  this.layerElement.setAttribute('aria-label', documentData.t);

		  var letters = documentData.l || [];
		  var usesGlyphs = !!this.globalData.fontManager.chars;
		  len = letters.length;

		  var tSpan;
		  var matrixHelper = this.mHelper;
		  var shapes;
		  var shapeStr = '';
		  var singleShape = this.data.singleShape;
		  var xPos = 0;
		  var yPos = 0;
		  var firstLine = true;
		  var trackingOffset = documentData.tr * 0.001 * documentData.finalSize;
		  if (singleShape && !usesGlyphs && !documentData.sz) {
		    var tElement = this.textContainer;
		    var justify = 'start';
		    switch (documentData.j) {
		      case 1:
		        justify = 'end';
		        break;
		      case 2:
		        justify = 'middle';
		        break;
		      default:
		        justify = 'start';
		        break;
		    }
		    tElement.setAttribute('text-anchor', justify);
		    tElement.setAttribute('letter-spacing', trackingOffset);
		    var textContent = this.buildTextContents(documentData.finalText);
		    len = textContent.length;
		    yPos = documentData.ps ? documentData.ps[1] + documentData.ascent : 0;
		    for (i = 0; i < len; i += 1) {
		      tSpan = this.textSpans[i] || createNS('tspan');
		      tSpan.textContent = textContent[i];
		      tSpan.setAttribute('x', 0);
		      tSpan.setAttribute('y', yPos);
		      tSpan.style.display = 'inherit';
		      tElement.appendChild(tSpan);
		      this.textSpans[i] = tSpan;
		      yPos += documentData.finalLineHeight;
		    }

		    this.layerElement.appendChild(tElement);
		  } else {
		    var cachedSpansLength = this.textSpans.length;
		    var shapeData;
		    var charData;
		    for (i = 0; i < len; i += 1) {
		      if (!usesGlyphs || !singleShape || i === 0) {
		        tSpan = cachedSpansLength > i ? this.textSpans[i] : createNS(usesGlyphs ? 'path' : 'text');
		        if (cachedSpansLength <= i) {
		          tSpan.setAttribute('stroke-linecap', 'butt');
		          tSpan.setAttribute('stroke-linejoin', 'round');
		          tSpan.setAttribute('stroke-miterlimit', '4');
		          this.textSpans[i] = tSpan;
		          this.layerElement.appendChild(tSpan);
		        }
		        tSpan.style.display = 'inherit';
		      }

		      matrixHelper.reset();
		      matrixHelper.scale(documentData.finalSize / 100, documentData.finalSize / 100);
		      if (singleShape) {
		        if (letters[i].n) {
		          xPos = -trackingOffset;
		          yPos += documentData.yOffset;
		          yPos += firstLine ? 1 : 0;
		          firstLine = false;
		        }
		        this.applyTextPropertiesToMatrix(documentData, matrixHelper, letters[i].line, xPos, yPos);
		        xPos += letters[i].l || 0;
		        // xPos += letters[i].val === ' ' ? 0 : trackingOffset;
		        xPos += trackingOffset;
		      }
		      if (usesGlyphs) {
		        charData = this.globalData.fontManager.getCharData(documentData.finalText[i], fontData.fStyle, this.globalData.fontManager.getFontByName(documentData.f).fFamily);
		        shapeData = (charData && charData.data) || {};
		        shapes = shapeData.shapes ? shapeData.shapes[0].it : [];
		        if (!singleShape) {
		          tSpan.setAttribute('d', this.createPathShape(matrixHelper, shapes));
		        } else {
		          shapeStr += this.createPathShape(matrixHelper, shapes);
		        }
		      } else {
		        if (singleShape) {
		          tSpan.setAttribute('transform', 'translate(' + matrixHelper.props[12] + ',' + matrixHelper.props[13] + ')');
		        }
		        tSpan.textContent = letters[i].val;
		        tSpan.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
		      }
		      //
		    }
		    if (singleShape && tSpan) {
		      tSpan.setAttribute('d', shapeStr);
		    }
		  }
		  while (i < this.textSpans.length) {
		    this.textSpans[i].style.display = 'none';
		    i += 1;
		  }

		  this._sizeChanged = true;
		};

		SVGTextLottieElement.prototype.sourceRectAtTime = function () {
		  this.prepareFrame(this.comp.renderedFrame - this.data.st);
		  this.renderInnerContent();
		  if (this._sizeChanged) {
		    this._sizeChanged = false;
		    var textBox = this.layerElement.getBBox();
		    this.bbox = {
		      top: textBox.y,
		      left: textBox.x,
		      width: textBox.width,
		      height: textBox.height,
		    };
		  }
		  return this.bbox;
		};

		SVGTextLottieElement.prototype.renderInnerContent = function () {
		  if (!this.data.singleShape) {
		    this.textAnimator.getMeasures(this.textProperty.currentData, this.lettersChangedFlag);
		    if (this.lettersChangedFlag || this.textAnimator.lettersChangedFlag) {
		      this._sizeChanged = true;
		      var i;
		      var len;
		      var renderedLetters = this.textAnimator.renderedLetters;

		      var letters = this.textProperty.currentData.l;

		      len = letters.length;
		      var renderedLetter;
		      var textSpan;
		      for (i = 0; i < len; i += 1) {
		        if (!letters[i].n) {
		          renderedLetter = renderedLetters[i];
		          textSpan = this.textSpans[i];
		          if (renderedLetter._mdf.m) {
		            textSpan.setAttribute('transform', renderedLetter.m);
		          }
		          if (renderedLetter._mdf.o) {
		            textSpan.setAttribute('opacity', renderedLetter.o);
		          }
		          if (renderedLetter._mdf.sw) {
		            textSpan.setAttribute('stroke-width', renderedLetter.sw);
		          }
		          if (renderedLetter._mdf.sc) {
		            textSpan.setAttribute('stroke', renderedLetter.sc);
		          }
		          if (renderedLetter._mdf.fc) {
		            textSpan.setAttribute('fill', renderedLetter.fc);
		          }
		        }
		      }
		    }
		  }
		};

		/* global extendPrototype, BaseElement, TransformElement, SVGBaseElement, IShapeElement, HierarchyElement,
		FrameElement, RenderableDOMElement, Matrix, SVGStyleData, SVGStrokeStyleData, SVGFillStyleData,
		SVGGradientFillStyleData, SVGGradientStrokeStyleData, locationHref, getBlendMode, ShapeGroupData,
		TransformPropertyFactory, SVGTransformData, ShapePropertyFactory, SVGShapeData, SVGElementsRenderer, ShapeModifiers,
		lineCapEnum, lineJoinEnum */

		function SVGShapeElement(data, globalData, comp) {
		  // List of drawable elements
		  this.shapes = [];
		  // Full shape data
		  this.shapesData = data.shapes;
		  // List of styles that will be applied to shapes
		  this.stylesList = [];
		  // List of modifiers that will be applied to shapes
		  this.shapeModifiers = [];
		  // List of items in shape tree
		  this.itemsData = [];
		  // List of items in previous shape tree
		  this.processedElements = [];
		  // List of animated components
		  this.animatedContents = [];
		  this.initElement(data, globalData, comp);
		  // Moving any property that doesn't get too much access after initialization because of v8 way of handling more than 10 properties.
		  // List of elements that have been created
		  this.prevViewData = [];
		  // Moving any property that doesn't get too much access after initialization because of v8 way of handling more than 10 properties.
		}

		extendPrototype([BaseElement, TransformElement, SVGBaseElement, IShapeElement, HierarchyElement, FrameElement, RenderableDOMElement], SVGShapeElement);

		SVGShapeElement.prototype.initSecondaryElement = function () {
		};

		SVGShapeElement.prototype.identityMatrix = new Matrix();

		SVGShapeElement.prototype.buildExpressionInterface = function () {};

		SVGShapeElement.prototype.createContent = function () {
		  this.searchShapes(this.shapesData, this.itemsData, this.prevViewData, this.layerElement, 0, [], true);
		  this.filterUniqueShapes();
		};

		/*
		This method searches for multiple shapes that affect a single element and one of them is animated
		*/
		SVGShapeElement.prototype.filterUniqueShapes = function () {
		  var i;
		  var len = this.shapes.length;
		  var shape;
		  var j;
		  var jLen = this.stylesList.length;
		  var style;
		  var tempShapes = [];
		  var areAnimated = false;
		  for (j = 0; j < jLen; j += 1) {
		    style = this.stylesList[j];
		    areAnimated = false;
		    tempShapes.length = 0;
		    for (i = 0; i < len; i += 1) {
		      shape = this.shapes[i];
		      if (shape.styles.indexOf(style) !== -1) {
		        tempShapes.push(shape);
		        areAnimated = shape._isAnimated || areAnimated;
		      }
		    }
		    if (tempShapes.length > 1 && areAnimated) {
		      this.setShapesAsAnimated(tempShapes);
		    }
		  }
		};

		SVGShapeElement.prototype.setShapesAsAnimated = function (shapes) {
		  var i;
		  var len = shapes.length;
		  for (i = 0; i < len; i += 1) {
		    shapes[i].setAsAnimated();
		  }
		};

		SVGShapeElement.prototype.createStyleElement = function (data, level) {
		  // TODO: prevent drawing of hidden styles
		  var elementData;
		  var styleOb = new SVGStyleData(data, level);

		  var pathElement = styleOb.pElem;
		  if (data.ty === 'st') {
		    elementData = new SVGStrokeStyleData(this, data, styleOb);
		  } else if (data.ty === 'fl') {
		    elementData = new SVGFillStyleData(this, data, styleOb);
		  } else if (data.ty === 'gf' || data.ty === 'gs') {
		    var GradientConstructor = data.ty === 'gf' ? SVGGradientFillStyleData : SVGGradientStrokeStyleData;
		    elementData = new GradientConstructor(this, data, styleOb);
		    this.globalData.defs.appendChild(elementData.gf);
		    if (elementData.maskId) {
		      this.globalData.defs.appendChild(elementData.ms);
		      this.globalData.defs.appendChild(elementData.of);
		      pathElement.setAttribute('mask', 'url(' + locationHref + '#' + elementData.maskId + ')');
		    }
		  }

		  if (data.ty === 'st' || data.ty === 'gs') {
		    pathElement.setAttribute('stroke-linecap', lineCapEnum[data.lc || 2]);
		    pathElement.setAttribute('stroke-linejoin', lineJoinEnum[data.lj || 2]);
		    pathElement.setAttribute('fill-opacity', '0');
		    if (data.lj === 1) {
		      pathElement.setAttribute('stroke-miterlimit', data.ml);
		    }
		  }

		  if (data.r === 2) {
		    pathElement.setAttribute('fill-rule', 'evenodd');
		  }

		  if (data.ln) {
		    pathElement.setAttribute('id', data.ln);
		  }
		  if (data.cl) {
		    pathElement.setAttribute('class', data.cl);
		  }
		  if (data.bm) {
		    pathElement.style['mix-blend-mode'] = getBlendMode(data.bm);
		  }
		  this.stylesList.push(styleOb);
		  this.addToAnimatedContents(data, elementData);
		  return elementData;
		};

		SVGShapeElement.prototype.createGroupElement = function (data) {
		  var elementData = new ShapeGroupData();
		  if (data.ln) {
		    elementData.gr.setAttribute('id', data.ln);
		  }
		  if (data.cl) {
		    elementData.gr.setAttribute('class', data.cl);
		  }
		  if (data.bm) {
		    elementData.gr.style['mix-blend-mode'] = getBlendMode(data.bm);
		  }
		  return elementData;
		};

		SVGShapeElement.prototype.createTransformElement = function (data, container) {
		  var transformProperty = TransformPropertyFactory.getTransformProperty(this, data, this);
		  var elementData = new SVGTransformData(transformProperty, transformProperty.o, container);
		  this.addToAnimatedContents(data, elementData);
		  return elementData;
		};

		SVGShapeElement.prototype.createShapeElement = function (data, ownTransformers, level) {
		  var ty = 4;
		  if (data.ty === 'rc') {
		    ty = 5;
		  } else if (data.ty === 'el') {
		    ty = 6;
		  } else if (data.ty === 'sr') {
		    ty = 7;
		  }
		  var shapeProperty = ShapePropertyFactory.getShapeProp(this, data, ty, this);
		  var elementData = new SVGShapeData(ownTransformers, level, shapeProperty);
		  this.shapes.push(elementData);
		  this.addShapeToModifiers(elementData);
		  this.addToAnimatedContents(data, elementData);
		  return elementData;
		};

		SVGShapeElement.prototype.addToAnimatedContents = function (data, element) {
		  var i = 0;
		  var len = this.animatedContents.length;
		  while (i < len) {
		    if (this.animatedContents[i].element === element) {
		      return;
		    }
		    i += 1;
		  }
		  this.animatedContents.push({
		    fn: SVGElementsRenderer.createRenderFunction(data),
		    element: element,
		    data: data,
		  });
		};

		SVGShapeElement.prototype.setElementStyles = function (elementData) {
		  var arr = elementData.styles;
		  var j;
		  var jLen = this.stylesList.length;
		  for (j = 0; j < jLen; j += 1) {
		    if (!this.stylesList[j].closed) {
		      arr.push(this.stylesList[j]);
		    }
		  }
		};

		SVGShapeElement.prototype.reloadShapes = function () {
		  this._isFirstFrame = true;
		  var i;
		  var len = this.itemsData.length;
		  for (i = 0; i < len; i += 1) {
		    this.prevViewData[i] = this.itemsData[i];
		  }
		  this.searchShapes(this.shapesData, this.itemsData, this.prevViewData, this.layerElement, 0, [], true);
		  this.filterUniqueShapes();
		  len = this.dynamicProperties.length;
		  for (i = 0; i < len; i += 1) {
		    this.dynamicProperties[i].getValue();
		  }
		  this.renderModifiers();
		};

		SVGShapeElement.prototype.searchShapes = function (arr, itemsData, prevViewData, container, level, transformers, render) {
		  var ownTransformers = [].concat(transformers);
		  var i;
		  var len = arr.length - 1;
		  var j;
		  var jLen;
		  var ownStyles = [];
		  var ownModifiers = [];
		  var currentTransform;
		  var modifier;
		  var processedPos;
		  for (i = len; i >= 0; i -= 1) {
		    processedPos = this.searchProcessedElement(arr[i]);
		    if (!processedPos) {
		      arr[i]._render = render;
		    } else {
		      itemsData[i] = prevViewData[processedPos - 1];
		    }
		    if (arr[i].ty === 'fl' || arr[i].ty === 'st' || arr[i].ty === 'gf' || arr[i].ty === 'gs') {
		      if (!processedPos) {
		        itemsData[i] = this.createStyleElement(arr[i], level);
		      } else {
		        itemsData[i].style.closed = false;
		      }
		      if (arr[i]._render) {
		        if (itemsData[i].style.pElem.parentNode !== container) {
		          container.appendChild(itemsData[i].style.pElem);
		        }
		      }
		      ownStyles.push(itemsData[i].style);
		    } else if (arr[i].ty === 'gr') {
		      if (!processedPos) {
		        itemsData[i] = this.createGroupElement(arr[i]);
		      } else {
		        jLen = itemsData[i].it.length;
		        for (j = 0; j < jLen; j += 1) {
		          itemsData[i].prevViewData[j] = itemsData[i].it[j];
		        }
		      }
		      this.searchShapes(arr[i].it, itemsData[i].it, itemsData[i].prevViewData, itemsData[i].gr, level + 1, ownTransformers, render);
		      if (arr[i]._render) {
		        if (itemsData[i].gr.parentNode !== container) {
		          container.appendChild(itemsData[i].gr);
		        }
		      }
		    } else if (arr[i].ty === 'tr') {
		      if (!processedPos) {
		        itemsData[i] = this.createTransformElement(arr[i], container);
		      }
		      currentTransform = itemsData[i].transform;
		      ownTransformers.push(currentTransform);
		    } else if (arr[i].ty === 'sh' || arr[i].ty === 'rc' || arr[i].ty === 'el' || arr[i].ty === 'sr') {
		      if (!processedPos) {
		        itemsData[i] = this.createShapeElement(arr[i], ownTransformers, level);
		      }
		      this.setElementStyles(itemsData[i]);
		    } else if (arr[i].ty === 'tm' || arr[i].ty === 'rd' || arr[i].ty === 'ms' || arr[i].ty === 'pb') {
		      if (!processedPos) {
		        modifier = ShapeModifiers.getModifier(arr[i].ty);
		        modifier.init(this, arr[i]);
		        itemsData[i] = modifier;
		        this.shapeModifiers.push(modifier);
		      } else {
		        modifier = itemsData[i];
		        modifier.closed = false;
		      }
		      ownModifiers.push(modifier);
		    } else if (arr[i].ty === 'rp') {
		      if (!processedPos) {
		        modifier = ShapeModifiers.getModifier(arr[i].ty);
		        itemsData[i] = modifier;
		        modifier.init(this, arr, i, itemsData);
		        this.shapeModifiers.push(modifier);
		        render = false;
		      } else {
		        modifier = itemsData[i];
		        modifier.closed = true;
		      }
		      ownModifiers.push(modifier);
		    }
		    this.addProcessedElement(arr[i], i + 1);
		  }
		  len = ownStyles.length;
		  for (i = 0; i < len; i += 1) {
		    ownStyles[i].closed = true;
		  }
		  len = ownModifiers.length;
		  for (i = 0; i < len; i += 1) {
		    ownModifiers[i].closed = true;
		  }
		};

		SVGShapeElement.prototype.renderInnerContent = function () {
		  this.renderModifiers();
		  var i;
		  var len = this.stylesList.length;
		  for (i = 0; i < len; i += 1) {
		    this.stylesList[i].reset();
		  }
		  this.renderShape();

		  for (i = 0; i < len; i += 1) {
		    if (this.stylesList[i]._mdf || this._isFirstFrame) {
		      if (this.stylesList[i].msElem) {
		        this.stylesList[i].msElem.setAttribute('d', this.stylesList[i].d);
		        // Adding M0 0 fixes same mask bug on all browsers
		        this.stylesList[i].d = 'M0 0' + this.stylesList[i].d;
		      }
		      this.stylesList[i].pElem.setAttribute('d', this.stylesList[i].d || 'M0 0');
		    }
		  }
		};

		SVGShapeElement.prototype.renderShape = function () {
		  var i;
		  var len = this.animatedContents.length;
		  var animatedContent;
		  for (i = 0; i < len; i += 1) {
		    animatedContent = this.animatedContents[i];
		    if ((this._isFirstFrame || animatedContent.element._isAnimated) && animatedContent.data !== true) {
		      animatedContent.fn(animatedContent.data, animatedContent.element, this._isFirstFrame);
		    }
		  }
		};

		SVGShapeElement.prototype.destroy = function () {
		  this.destroyBaseElement();
		  this.shapesData = null;
		  this.itemsData = null;
		};

		/* exported SVGEffects */

		function SVGEffects() {}

		/* global createTag, AnimationItem */
		/* exported animationManager */

		var animationManager = (function () {
		  var moduleOb = {};
		  var registeredAnimations = [];
		  var initTime = 0;
		  var len = 0;
		  var playingAnimationsNum = 0;
		  var _stopped = true;
		  var _isFrozen = false;

		  function removeElement(ev) {
		    var i = 0;
		    var animItem = ev.target;
		    while (i < len) {
		      if (registeredAnimations[i].animation === animItem) {
		        registeredAnimations.splice(i, 1);
		        i -= 1;
		        len -= 1;
		        if (!animItem.isPaused) {
		          subtractPlayingCount();
		        }
		      }
		      i += 1;
		    }
		  }

		  function registerAnimation(element, animationData) {
		    if (!element) {
		      return null;
		    }
		    var i = 0;
		    while (i < len) {
		      if (registeredAnimations[i].elem === element && registeredAnimations[i].elem !== null) {
		        return registeredAnimations[i].animation;
		      }
		      i += 1;
		    }
		    var animItem = new AnimationItem();
		    setupAnimation(animItem, element);
		    animItem.setData(element, animationData);
		    return animItem;
		  }

		  function getRegisteredAnimations() {
		    var i;
		    var lenAnims = registeredAnimations.length;
		    var animations = [];
		    for (i = 0; i < lenAnims; i += 1) {
		      animations.push(registeredAnimations[i].animation);
		    }
		    return animations;
		  }

		  function addPlayingCount() {
		    playingAnimationsNum += 1;
		    activate();
		  }

		  function subtractPlayingCount() {
		    playingAnimationsNum -= 1;
		  }

		  function setupAnimation(animItem, element) {
		    animItem.addEventListener('destroy', removeElement);
		    animItem.addEventListener('_active', addPlayingCount);
		    animItem.addEventListener('_idle', subtractPlayingCount);
		    registeredAnimations.push({ elem: element, animation: animItem });
		    len += 1;
		  }

		  function loadAnimation(params) {
		    var animItem = new AnimationItem();
		    setupAnimation(animItem, null);
		    animItem.setParams(params);
		    return animItem;
		  }

		  function setSpeed(val, animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.setSpeed(val, animation);
		    }
		  }

		  function setDirection(val, animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.setDirection(val, animation);
		    }
		  }

		  function play(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.play(animation);
		    }
		  }
		  function resume(nowTime) {
		    var elapsedTime = nowTime - initTime;
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.advanceTime(elapsedTime);
		    }
		    initTime = nowTime;
		    if (playingAnimationsNum && !_isFrozen) {
		      window.requestAnimationFrame(resume);
		    } else {
		      _stopped = true;
		    }
		  }

		  function first(nowTime) {
		    initTime = nowTime;
		    window.requestAnimationFrame(resume);
		  }

		  function pause(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.pause(animation);
		    }
		  }

		  function goToAndStop(value, isFrame, animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.goToAndStop(value, isFrame, animation);
		    }
		  }

		  function stop(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.stop(animation);
		    }
		  }

		  function togglePause(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.togglePause(animation);
		    }
		  }

		  function destroy(animation) {
		    var i;
		    for (i = (len - 1); i >= 0; i -= 1) {
		      registeredAnimations[i].animation.destroy(animation);
		    }
		  }

		  function searchAnimations(animationData, standalone, renderer) {
		    var animElements = [].concat([].slice.call(document.getElementsByClassName('lottie')),
		      [].slice.call(document.getElementsByClassName('bodymovin')));
		    var i;
		    var lenAnims = animElements.length;
		    for (i = 0; i < lenAnims; i += 1) {
		      if (renderer) {
		        animElements[i].setAttribute('data-bm-type', renderer);
		      }
		      registerAnimation(animElements[i], animationData);
		    }
		    if (standalone && lenAnims === 0) {
		      if (!renderer) {
		        renderer = 'svg';
		      }
		      var body = document.getElementsByTagName('body')[0];
		      body.innerText = '';
		      var div = createTag('div');
		      div.style.width = '100%';
		      div.style.height = '100%';
		      div.setAttribute('data-bm-type', renderer);
		      body.appendChild(div);
		      registerAnimation(div, animationData);
		    }
		  }

		  function resize() {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.resize();
		    }
		  }

		  function activate() {
		    if (!_isFrozen && playingAnimationsNum) {
		      if (_stopped) {
		        window.requestAnimationFrame(first);
		        _stopped = false;
		      }
		    }
		  }

		  function freeze() {
		    _isFrozen = true;
		  }

		  function unfreeze() {
		    _isFrozen = false;
		    activate();
		  }

		  function setVolume(val, animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.setVolume(val, animation);
		    }
		  }

		  function mute(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.mute(animation);
		    }
		  }

		  function unmute(animation) {
		    var i;
		    for (i = 0; i < len; i += 1) {
		      registeredAnimations[i].animation.unmute(animation);
		    }
		  }

		  moduleOb.registerAnimation = registerAnimation;
		  moduleOb.loadAnimation = loadAnimation;
		  moduleOb.setSpeed = setSpeed;
		  moduleOb.setDirection = setDirection;
		  moduleOb.play = play;
		  moduleOb.pause = pause;
		  moduleOb.stop = stop;
		  moduleOb.togglePause = togglePause;
		  moduleOb.searchAnimations = searchAnimations;
		  moduleOb.resize = resize;
		  // moduleOb.start = start;
		  moduleOb.goToAndStop = goToAndStop;
		  moduleOb.destroy = destroy;
		  moduleOb.freeze = freeze;
		  moduleOb.unfreeze = unfreeze;
		  moduleOb.setVolume = setVolume;
		  moduleOb.mute = mute;
		  moduleOb.unmute = unmute;
		  moduleOb.getRegisteredAnimations = getRegisteredAnimations;
		  return moduleOb;
		}());

		/* global createElementID, subframeEnabled, ProjectInterface, ImagePreloader, audioControllerFactory, extendPrototype, BaseEvent,
		CanvasRenderer, SVGRenderer, HybridRenderer, dataManager, expressionsPlugin, BMEnterFrameEvent, BMCompleteLoopEvent,
		BMCompleteEvent, BMSegmentStartEvent, BMDestroyEvent, BMEnterFrameEvent, BMCompleteLoopEvent, BMCompleteEvent, BMSegmentStartEvent,
		BMDestroyEvent, BMRenderFrameErrorEvent, BMConfigErrorEvent, markerParser */

		var AnimationItem = function () {
		  this._cbs = [];
		  this.name = '';
		  this.path = '';
		  this.isLoaded = false;
		  this.currentFrame = 0;
		  this.currentRawFrame = 0;
		  this.firstFrame = 0;
		  this.totalFrames = 0;
		  this.frameRate = 0;
		  this.frameMult = 0;
		  this.playSpeed = 1;
		  this.playDirection = 1;
		  this.playCount = 0;
		  this.animationData = {};
		  this.assets = [];
		  this.isPaused = true;
		  this.autoplay = false;
		  this.loop = true;
		  this.renderer = null;
		  this.animationID = createElementID();
		  this.assetsPath = '';
		  this.timeCompleted = 0;
		  this.segmentPos = 0;
		  this.isSubframeEnabled = subframeEnabled;
		  this.segments = [];
		  this._idle = true;
		  this._completedLoop = false;
		  this.projectInterface = ProjectInterface();
		  this.imagePreloader = new ImagePreloader();
		  this.audioController = audioControllerFactory();
		  this.markers = [];
		  this.configAnimation = this.configAnimation.bind(this);
		  this.onSetupError = this.onSetupError.bind(this);
		  this.onSegmentComplete = this.onSegmentComplete.bind(this);
		};

		extendPrototype([BaseEvent], AnimationItem);

		AnimationItem.prototype.setParams = function (params) {
		  if (params.wrapper || params.container) {
		    this.wrapper = params.wrapper || params.container;
		  }
		  var animType = 'svg';
		  if (params.animType) {
		    animType = params.animType;
		  } else if (params.renderer) {
		    animType = params.renderer;
		  }
		  switch (animType) {
		    case 'canvas':
		      this.renderer = new CanvasRenderer(this, params.rendererSettings);
		      break;
		    case 'svg':
		      this.renderer = new SVGRenderer(this, params.rendererSettings);
		      break;
		    default:
		      this.renderer = new HybridRenderer(this, params.rendererSettings);
		      break;
		  }
		  this.imagePreloader.setCacheType(animType, this.renderer.globalData.defs);
		  this.renderer.setProjectInterface(this.projectInterface);
		  this.animType = animType;
		  if (params.loop === ''
		        || params.loop === null
		        || params.loop === undefined
		        || params.loop === true) {
		    this.loop = true;
		  } else if (params.loop === false) {
		    this.loop = false;
		  } else {
		    this.loop = parseInt(params.loop, 10);
		  }
		  this.autoplay = 'autoplay' in params ? params.autoplay : true;
		  this.name = params.name ? params.name : '';
		  this.autoloadSegments = Object.prototype.hasOwnProperty.call(params, 'autoloadSegments') ? params.autoloadSegments : true;
		  this.assetsPath = params.assetsPath;
		  this.initialSegment = params.initialSegment;
		  if (params.audioFactory) {
		    this.audioController.setAudioFactory(params.audioFactory);
		  }
		  if (params.animationData) {
		    this.setupAnimation(params.animationData);
		  } else if (params.path) {
		    if (params.path.lastIndexOf('\\') !== -1) {
		      this.path = params.path.substr(0, params.path.lastIndexOf('\\') + 1);
		    } else {
		      this.path = params.path.substr(0, params.path.lastIndexOf('/') + 1);
		    }
		    this.fileName = params.path.substr(params.path.lastIndexOf('/') + 1);
		    this.fileName = this.fileName.substr(0, this.fileName.lastIndexOf('.json'));
		    dataManager.loadAnimation(
		      params.path,
		      this.configAnimation,
		      this.onSetupError
		    );
		  }
		};

		AnimationItem.prototype.onSetupError = function () {
		  this.trigger('data_failed');
		};

		AnimationItem.prototype.setupAnimation = function (data) {
		  dataManager.completeAnimation(
		    data,
		    this.configAnimation
		  );
		};

		AnimationItem.prototype.setData = function (wrapper, animationData) {
		  if (animationData) {
		    if (typeof animationData !== 'object') {
		      animationData = JSON.parse(animationData);
		    }
		  }
		  var params = {
		    wrapper: wrapper,
		    animationData: animationData,
		  };
		  var wrapperAttributes = wrapper.attributes;

		  params.path = wrapperAttributes.getNamedItem('data-animation-path') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-animation-path').value
		    : wrapperAttributes.getNamedItem('data-bm-path') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-path').value
		      : wrapperAttributes.getNamedItem('bm-path')
		        ? wrapperAttributes.getNamedItem('bm-path').value
		        : '';
		  params.animType = wrapperAttributes.getNamedItem('data-anim-type') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-anim-type').value
		    : wrapperAttributes.getNamedItem('data-bm-type') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-type').value
		      : wrapperAttributes.getNamedItem('bm-type') // eslint-disable-line no-nested-ternary
		        ? wrapperAttributes.getNamedItem('bm-type').value
		        : wrapperAttributes.getNamedItem('data-bm-renderer') // eslint-disable-line no-nested-ternary
		          ? wrapperAttributes.getNamedItem('data-bm-renderer').value
		          : wrapperAttributes.getNamedItem('bm-renderer')
		            ? wrapperAttributes.getNamedItem('bm-renderer').value
		            : 'canvas';

		  var loop = wrapperAttributes.getNamedItem('data-anim-loop') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-anim-loop').value
		    : wrapperAttributes.getNamedItem('data-bm-loop') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-loop').value
		      : wrapperAttributes.getNamedItem('bm-loop')
		        ? wrapperAttributes.getNamedItem('bm-loop').value
		        : '';
		  if (loop === 'false') {
		    params.loop = false;
		  } else if (loop === 'true') {
		    params.loop = true;
		  } else if (loop !== '') {
		    params.loop = parseInt(loop, 10);
		  }
		  var autoplay = wrapperAttributes.getNamedItem('data-anim-autoplay') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-anim-autoplay').value
		    : wrapperAttributes.getNamedItem('data-bm-autoplay') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-autoplay').value
		      : wrapperAttributes.getNamedItem('bm-autoplay')
		        ? wrapperAttributes.getNamedItem('bm-autoplay').value
		        : true;
		  params.autoplay = autoplay !== 'false';

		  params.name = wrapperAttributes.getNamedItem('data-name') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-name').value
		    : wrapperAttributes.getNamedItem('data-bm-name') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-name').value
		      : wrapperAttributes.getNamedItem('bm-name')
		        ? wrapperAttributes.getNamedItem('bm-name').value
		        : '';
		  var prerender = wrapperAttributes.getNamedItem('data-anim-prerender') // eslint-disable-line no-nested-ternary
		    ? wrapperAttributes.getNamedItem('data-anim-prerender').value
		    : wrapperAttributes.getNamedItem('data-bm-prerender') // eslint-disable-line no-nested-ternary
		      ? wrapperAttributes.getNamedItem('data-bm-prerender').value
		      : wrapperAttributes.getNamedItem('bm-prerender')
		        ? wrapperAttributes.getNamedItem('bm-prerender').value
		        : '';

		  if (prerender === 'false') {
		    params.prerender = false;
		  }
		  this.setParams(params);
		};

		AnimationItem.prototype.includeLayers = function (data) {
		  if (data.op > this.animationData.op) {
		    this.animationData.op = data.op;
		    this.totalFrames = Math.floor(data.op - this.animationData.ip);
		  }
		  var layers = this.animationData.layers;
		  var i;
		  var len = layers.length;
		  var newLayers = data.layers;
		  var j;
		  var jLen = newLayers.length;
		  for (j = 0; j < jLen; j += 1) {
		    i = 0;
		    while (i < len) {
		      if (layers[i].id === newLayers[j].id) {
		        layers[i] = newLayers[j];
		        break;
		      }
		      i += 1;
		    }
		  }
		  if (data.chars || data.fonts) {
		    this.renderer.globalData.fontManager.addChars(data.chars);
		    this.renderer.globalData.fontManager.addFonts(data.fonts, this.renderer.globalData.defs);
		  }
		  if (data.assets) {
		    len = data.assets.length;
		    for (i = 0; i < len; i += 1) {
		      this.animationData.assets.push(data.assets[i]);
		    }
		  }
		  this.animationData.__complete = false;
		  dataManager.completeAnimation(
		    this.animationData,
		    this.onSegmentComplete
		  );
		};

		AnimationItem.prototype.onSegmentComplete = function (data) {
		  this.animationData = data;
		  if (expressionsPlugin) {
		    expressionsPlugin.initExpressions(this);
		  }
		  this.loadNextSegment();
		};

		AnimationItem.prototype.loadNextSegment = function () {
		  var segments = this.animationData.segments;
		  if (!segments || segments.length === 0 || !this.autoloadSegments) {
		    this.trigger('data_ready');
		    this.timeCompleted = this.totalFrames;
		    return;
		  }
		  var segment = segments.shift();
		  this.timeCompleted = segment.time * this.frameRate;
		  var segmentPath = this.path + this.fileName + '_' + this.segmentPos + '.json';
		  this.segmentPos += 1;
		  dataManager.loadData(segmentPath, this.includeLayers.bind(this), function () {
		    this.trigger('data_failed');
		  }.bind(this));
		};

		AnimationItem.prototype.loadSegments = function () {
		  var segments = this.animationData.segments;
		  if (!segments) {
		    this.timeCompleted = this.totalFrames;
		  }
		  this.loadNextSegment();
		};

		AnimationItem.prototype.imagesLoaded = function () {
		  this.trigger('loaded_images');
		  this.checkLoaded();
		};

		AnimationItem.prototype.preloadImages = function () {
		  this.imagePreloader.setAssetsPath(this.assetsPath);
		  this.imagePreloader.setPath(this.path);
		  this.imagePreloader.loadAssets(this.animationData.assets, this.imagesLoaded.bind(this));
		};

		AnimationItem.prototype.configAnimation = function (animData) {
		  if (!this.renderer) {
		    return;
		  }
		  try {
		    this.animationData = animData;
		    if (this.initialSegment) {
		      this.totalFrames = Math.floor(this.initialSegment[1] - this.initialSegment[0]);
		      this.firstFrame = Math.round(this.initialSegment[0]);
		    } else {
		      this.totalFrames = Math.floor(this.animationData.op - this.animationData.ip);
		      this.firstFrame = Math.round(this.animationData.ip);
		    }
		    this.renderer.configAnimation(animData);
		    if (!animData.assets) {
		      animData.assets = [];
		    }

		    this.assets = this.animationData.assets;
		    this.frameRate = this.animationData.fr;
		    this.frameMult = this.animationData.fr / 1000;
		    this.renderer.searchExtraCompositions(animData.assets);
		    this.markers = markerParser(animData.markers || []);
		    this.trigger('config_ready');
		    this.preloadImages();
		    this.loadSegments();
		    this.updaFrameModifier();
		    this.waitForFontsLoaded();
		    if (this.isPaused) {
		      this.audioController.pause();
		    }
		  } catch (error) {
		    this.triggerConfigError(error);
		  }
		};

		AnimationItem.prototype.waitForFontsLoaded = function () {
		  if (!this.renderer) {
		    return;
		  }
		  if (this.renderer.globalData.fontManager.isLoaded) {
		    this.checkLoaded();
		  } else {
		    setTimeout(this.waitForFontsLoaded.bind(this), 20);
		  }
		};

		AnimationItem.prototype.checkLoaded = function () {
		  if (!this.isLoaded
		        && this.renderer.globalData.fontManager.isLoaded
		        && (this.imagePreloader.loadedImages() || this.renderer.rendererType !== 'canvas')
		        && (this.imagePreloader.loadedFootages())
		  ) {
		    this.isLoaded = true;
		    if (expressionsPlugin) {
		      expressionsPlugin.initExpressions(this);
		    }
		    this.renderer.initItems();
		    setTimeout(function () {
		      this.trigger('DOMLoaded');
		    }.bind(this), 0);
		    this.gotoFrame();
		    if (this.autoplay) {
		      this.play();
		    }
		  }
		};

		AnimationItem.prototype.resize = function () {
		  this.renderer.updateContainerSize();
		};

		AnimationItem.prototype.setSubframe = function (flag) {
		  this.isSubframeEnabled = !!flag;
		};

		AnimationItem.prototype.gotoFrame = function () {
		  this.currentFrame = this.isSubframeEnabled ? this.currentRawFrame : ~~this.currentRawFrame; // eslint-disable-line no-bitwise

		  if (this.timeCompleted !== this.totalFrames && this.currentFrame > this.timeCompleted) {
		    this.currentFrame = this.timeCompleted;
		  }
		  this.trigger('enterFrame');
		  this.renderFrame();
		  this.trigger('drawnFrame');
		};

		AnimationItem.prototype.renderFrame = function () {
		  if (this.isLoaded === false || !this.renderer) {
		    return;
		  }
		  try {
		    this.renderer.renderFrame(this.currentFrame + this.firstFrame);
		  } catch (error) {
		    this.triggerRenderFrameError(error);
		  }
		};

		AnimationItem.prototype.play = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  if (this.isPaused === true) {
		    this.isPaused = false;
		    this.audioController.resume();
		    if (this._idle) {
		      this._idle = false;
		      this.trigger('_active');
		    }
		  }
		};

		AnimationItem.prototype.pause = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  if (this.isPaused === false) {
		    this.isPaused = true;
		    this._idle = true;
		    this.trigger('_idle');
		    this.audioController.pause();
		  }
		};

		AnimationItem.prototype.togglePause = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  if (this.isPaused === true) {
		    this.play();
		  } else {
		    this.pause();
		  }
		};

		AnimationItem.prototype.stop = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  this.pause();
		  this.playCount = 0;
		  this._completedLoop = false;
		  this.setCurrentRawFrameValue(0);
		};

		AnimationItem.prototype.getMarkerData = function (markerName) {
		  var marker;
		  for (var i = 0; i < this.markers.length; i += 1) {
		    marker = this.markers[i];
		    if (marker.payload && marker.payload.name === markerName) {
		      return marker;
		    }
		  }
		  return null;
		};

		AnimationItem.prototype.goToAndStop = function (value, isFrame, name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  var numValue = Number(value);
		  if (isNaN(numValue)) {
		    var marker = this.getMarkerData(value);
		    if (marker) {
		      this.goToAndStop(marker.time, true);
		    }
		  } else if (isFrame) {
		    this.setCurrentRawFrameValue(value);
		  } else {
		    this.setCurrentRawFrameValue(value * this.frameModifier);
		  }
		  this.pause();
		};

		AnimationItem.prototype.goToAndPlay = function (value, isFrame, name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  var numValue = Number(value);
		  if (isNaN(numValue)) {
		    var marker = this.getMarkerData(value);
		    if (marker) {
		      if (!marker.duration) {
		        this.goToAndStop(marker.time, true);
		      } else {
		        this.playSegments([marker.time, marker.time + marker.duration], true);
		      }
		    }
		  } else {
		    this.goToAndStop(numValue, isFrame, name);
		  }
		  this.play();
		};

		AnimationItem.prototype.advanceTime = function (value) {
		  if (this.isPaused === true || this.isLoaded === false) {
		    return;
		  }
		  var nextValue = this.currentRawFrame + value * this.frameModifier;
		  var _isComplete = false;
		  // Checking if nextValue > totalFrames - 1 for addressing non looping and looping animations.
		  // If animation won't loop, it should stop at totalFrames - 1. If it will loop it should complete the last frame and then loop.
		  if (nextValue >= this.totalFrames - 1 && this.frameModifier > 0) {
		    if (!this.loop || this.playCount === this.loop) {
		      if (!this.checkSegments(nextValue > this.totalFrames ? nextValue % this.totalFrames : 0)) {
		        _isComplete = true;
		        nextValue = this.totalFrames - 1;
		      }
		    } else if (nextValue >= this.totalFrames) {
		      this.playCount += 1;
		      if (!this.checkSegments(nextValue % this.totalFrames)) {
		        this.setCurrentRawFrameValue(nextValue % this.totalFrames);
		        this._completedLoop = true;
		        this.trigger('loopComplete');
		      }
		    } else {
		      this.setCurrentRawFrameValue(nextValue);
		    }
		  } else if (nextValue < 0) {
		    if (!this.checkSegments(nextValue % this.totalFrames)) {
		      if (this.loop && !(this.playCount-- <= 0 && this.loop !== true)) { // eslint-disable-line no-plusplus
		        this.setCurrentRawFrameValue(this.totalFrames + (nextValue % this.totalFrames));
		        if (!this._completedLoop) {
		          this._completedLoop = true;
		        } else {
		          this.trigger('loopComplete');
		        }
		      } else {
		        _isComplete = true;
		        nextValue = 0;
		      }
		    }
		  } else {
		    this.setCurrentRawFrameValue(nextValue);
		  }
		  if (_isComplete) {
		    this.setCurrentRawFrameValue(nextValue);
		    this.pause();
		    this.trigger('complete');
		  }
		};

		AnimationItem.prototype.adjustSegment = function (arr, offset) {
		  this.playCount = 0;
		  if (arr[1] < arr[0]) {
		    if (this.frameModifier > 0) {
		      if (this.playSpeed < 0) {
		        this.setSpeed(-this.playSpeed);
		      } else {
		        this.setDirection(-1);
		      }
		    }
		    this.totalFrames = arr[0] - arr[1];
		    this.timeCompleted = this.totalFrames;
		    this.firstFrame = arr[1];
		    this.setCurrentRawFrameValue(this.totalFrames - 0.001 - offset);
		  } else if (arr[1] > arr[0]) {
		    if (this.frameModifier < 0) {
		      if (this.playSpeed < 0) {
		        this.setSpeed(-this.playSpeed);
		      } else {
		        this.setDirection(1);
		      }
		    }
		    this.totalFrames = arr[1] - arr[0];
		    this.timeCompleted = this.totalFrames;
		    this.firstFrame = arr[0];
		    this.setCurrentRawFrameValue(0.001 + offset);
		  }
		  this.trigger('segmentStart');
		};
		AnimationItem.prototype.setSegment = function (init, end) {
		  var pendingFrame = -1;
		  if (this.isPaused) {
		    if (this.currentRawFrame + this.firstFrame < init) {
		      pendingFrame = init;
		    } else if (this.currentRawFrame + this.firstFrame > end) {
		      pendingFrame = end - init;
		    }
		  }

		  this.firstFrame = init;
		  this.totalFrames = end - init;
		  this.timeCompleted = this.totalFrames;
		  if (pendingFrame !== -1) {
		    this.goToAndStop(pendingFrame, true);
		  }
		};

		AnimationItem.prototype.playSegments = function (arr, forceFlag) {
		  if (forceFlag) {
		    this.segments.length = 0;
		  }
		  if (typeof arr[0] === 'object') {
		    var i;
		    var len = arr.length;
		    for (i = 0; i < len; i += 1) {
		      this.segments.push(arr[i]);
		    }
		  } else {
		    this.segments.push(arr);
		  }
		  if (this.segments.length && forceFlag) {
		    this.adjustSegment(this.segments.shift(), 0);
		  }
		  if (this.isPaused) {
		    this.play();
		  }
		};

		AnimationItem.prototype.resetSegments = function (forceFlag) {
		  this.segments.length = 0;
		  this.segments.push([this.animationData.ip, this.animationData.op]);
		  if (forceFlag) {
		    this.checkSegments(0);
		  }
		};
		AnimationItem.prototype.checkSegments = function (offset) {
		  if (this.segments.length) {
		    this.adjustSegment(this.segments.shift(), offset);
		    return true;
		  }
		  return false;
		};

		AnimationItem.prototype.destroy = function (name) {
		  if ((name && this.name !== name) || !this.renderer) {
		    return;
		  }
		  this.renderer.destroy();
		  this.imagePreloader.destroy();
		  this.trigger('destroy');
		  this._cbs = null;
		  this.onEnterFrame = null;
		  this.onLoopComplete = null;
		  this.onComplete = null;
		  this.onSegmentStart = null;
		  this.onDestroy = null;
		  this.renderer = null;
		  this.renderer = null;
		  this.imagePreloader = null;
		  this.projectInterface = null;
		};

		AnimationItem.prototype.setCurrentRawFrameValue = function (value) {
		  this.currentRawFrame = value;
		  this.gotoFrame();
		};

		AnimationItem.prototype.setSpeed = function (val) {
		  this.playSpeed = val;
		  this.updaFrameModifier();
		};

		AnimationItem.prototype.setDirection = function (val) {
		  this.playDirection = val < 0 ? -1 : 1;
		  this.updaFrameModifier();
		};

		AnimationItem.prototype.setVolume = function (val, name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  this.audioController.setVolume(val);
		};

		AnimationItem.prototype.getVolume = function () {
		  return this.audioController.getVolume();
		};

		AnimationItem.prototype.mute = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  this.audioController.mute();
		};

		AnimationItem.prototype.unmute = function (name) {
		  if (name && this.name !== name) {
		    return;
		  }
		  this.audioController.unmute();
		};

		AnimationItem.prototype.updaFrameModifier = function () {
		  this.frameModifier = this.frameMult * this.playSpeed * this.playDirection;
		  this.audioController.setRate(this.playSpeed * this.playDirection);
		};

		AnimationItem.prototype.getPath = function () {
		  return this.path;
		};

		AnimationItem.prototype.getAssetsPath = function (assetData) {
		  var path = '';
		  if (assetData.e) {
		    path = assetData.p;
		  } else if (this.assetsPath) {
		    var imagePath = assetData.p;
		    if (imagePath.indexOf('images/') !== -1) {
		      imagePath = imagePath.split('/')[1];
		    }
		    path = this.assetsPath + imagePath;
		  } else {
		    path = this.path;
		    path += assetData.u ? assetData.u : '';
		    path += assetData.p;
		  }
		  return path;
		};

		AnimationItem.prototype.getAssetData = function (id) {
		  var i = 0;
		  var len = this.assets.length;
		  while (i < len) {
		    if (id === this.assets[i].id) {
		      return this.assets[i];
		    }
		    i += 1;
		  }
		  return null;
		};

		AnimationItem.prototype.hide = function () {
		  this.renderer.hide();
		};

		AnimationItem.prototype.show = function () {
		  this.renderer.show();
		};

		AnimationItem.prototype.getDuration = function (isFrame) {
		  return isFrame ? this.totalFrames : this.totalFrames / this.frameRate;
		};

		AnimationItem.prototype.trigger = function (name) {
		  if (this._cbs && this._cbs[name]) {
		    switch (name) {
		      case 'enterFrame':
		      case 'drawnFrame':
		        this.triggerEvent(name, new BMEnterFrameEvent(name, this.currentFrame, this.totalFrames, this.frameModifier));
		        break;
		      case 'loopComplete':
		        this.triggerEvent(name, new BMCompleteLoopEvent(name, this.loop, this.playCount, this.frameMult));
		        break;
		      case 'complete':
		        this.triggerEvent(name, new BMCompleteEvent(name, this.frameMult));
		        break;
		      case 'segmentStart':
		        this.triggerEvent(name, new BMSegmentStartEvent(name, this.firstFrame, this.totalFrames));
		        break;
		      case 'destroy':
		        this.triggerEvent(name, new BMDestroyEvent(name, this));
		        break;
		      default:
		        this.triggerEvent(name);
		    }
		  }
		  if (name === 'enterFrame' && this.onEnterFrame) {
		    this.onEnterFrame.call(this, new BMEnterFrameEvent(name, this.currentFrame, this.totalFrames, this.frameMult));
		  }
		  if (name === 'loopComplete' && this.onLoopComplete) {
		    this.onLoopComplete.call(this, new BMCompleteLoopEvent(name, this.loop, this.playCount, this.frameMult));
		  }
		  if (name === 'complete' && this.onComplete) {
		    this.onComplete.call(this, new BMCompleteEvent(name, this.frameMult));
		  }
		  if (name === 'segmentStart' && this.onSegmentStart) {
		    this.onSegmentStart.call(this, new BMSegmentStartEvent(name, this.firstFrame, this.totalFrames));
		  }
		  if (name === 'destroy' && this.onDestroy) {
		    this.onDestroy.call(this, new BMDestroyEvent(name, this));
		  }
		};

		AnimationItem.prototype.triggerRenderFrameError = function (nativeError) {
		  var error = new BMRenderFrameErrorEvent(nativeError, this.currentFrame);
		  this.triggerEvent('error', error);

		  if (this.onError) {
		    this.onError.call(this, error);
		  }
		};

		AnimationItem.prototype.triggerConfigError = function (nativeError) {
		  var error = new BMConfigErrorEvent(nativeError, this.currentFrame);
		  this.triggerEvent('error', error);

		  if (this.onError) {
		    this.onError.call(this, error);
		  }
		};

		/* exported EffectsManager */

		function EffectsManager() {
		  this.effectElements = [];
		}


		var lottie = {};

		function setLocationHref(href) {
		  locationHref = href;
		}

		function searchAnimations() {
		  {
		    animationManager.searchAnimations();
		  }
		}

		function setSubframeRendering(flag) {
		  subframeEnabled = flag;
		}

		function setIDPrefix(prefix) {
		  idPrefix = prefix;
		}

		function loadAnimation(params) {
		  return animationManager.loadAnimation(params);
		}

		function setQuality(value) {
		  if (typeof value === 'string') {
		    switch (value) {
		      case 'high':
		        defaultCurveSegments = 200;
		        break;
		      default:
		      case 'medium':
		        defaultCurveSegments = 50;
		        break;
		      case 'low':
		        defaultCurveSegments = 10;
		        break;
		    }
		  } else if (!isNaN(value) && value > 1) {
		    defaultCurveSegments = value;
		  }
		}

		function inBrowser() {
		  return typeof navigator !== 'undefined';
		}

		function installPlugin(type, plugin) {
		  if (type === 'expressions') {
		    expressionsPlugin = plugin;
		  }
		}

		function getFactory(name) {
		  switch (name) {
		    case 'propertyFactory':
		      return PropertyFactory;
		    case 'shapePropertyFactory':
		      return ShapePropertyFactory;
		    case 'matrix':
		      return Matrix;
		    default:
		      return null;
		  }
		}

		lottie.play = animationManager.play;
		lottie.pause = animationManager.pause;
		lottie.setLocationHref = setLocationHref;
		lottie.togglePause = animationManager.togglePause;
		lottie.setSpeed = animationManager.setSpeed;
		lottie.setDirection = animationManager.setDirection;
		lottie.stop = animationManager.stop;
		lottie.searchAnimations = searchAnimations;
		lottie.registerAnimation = animationManager.registerAnimation;
		lottie.loadAnimation = loadAnimation;
		lottie.setSubframeRendering = setSubframeRendering;
		lottie.resize = animationManager.resize;
		// lottie.start = start;
		lottie.goToAndStop = animationManager.goToAndStop;
		lottie.destroy = animationManager.destroy;
		lottie.setQuality = setQuality;
		lottie.inBrowser = inBrowser;
		lottie.installPlugin = installPlugin;
		lottie.freeze = animationManager.freeze;
		lottie.unfreeze = animationManager.unfreeze;
		lottie.setVolume = animationManager.setVolume;
		lottie.mute = animationManager.mute;
		lottie.unmute = animationManager.unmute;
		lottie.getRegisteredAnimations = animationManager.getRegisteredAnimations;
		lottie.useWebWorker = function (flag) {
		  _useWebWorker = flag;
		};
		lottie.setIDPrefix = setIDPrefix;
		lottie.__getFactory = getFactory;
		lottie.version = '5.8.1';

		function checkReady() {
		  if (document.readyState === 'complete') {
		    clearInterval(readyStateCheckInterval);
		    searchAnimations();
		  }
		}

		function getQueryVariable(variable) {
		  var vars = queryString.split('&');
		  for (var i = 0; i < vars.length; i += 1) {
		    var pair = vars[i].split('=');
		    if (decodeURIComponent(pair[0]) == variable) { // eslint-disable-line eqeqeq
		      return decodeURIComponent(pair[1]);
		    }
		  }
		  return null;
		}
		var queryString;
		{
		  var scripts = document.getElementsByTagName('script');
		  var index = scripts.length - 1;
		  var myScript = scripts[index] || {
		    src: '',
		  };
		  queryString = myScript.src.replace(/^[^\?]+\??/, ''); // eslint-disable-line no-useless-escape
		  getQueryVariable('renderer');
		}
		var readyStateCheckInterval = setInterval(checkReady, 100);

		return lottie;
		})); 
	} (lottieWebLight));
	return lottieWebLight.exports;
}

var lottieWebLightExports = requireLottieWebLight();
const m = /*@__PURE__*/getDefaultExportFromCjs(lottieWebLightExports);

function w(e,n){ void 0===n&&(n={});var t=n.insertAt;if(e&&"undefined"!=typeof document){var a=document.head||document.getElementsByTagName("head")[0],o=document.createElement("style");o.type="text/css","top"===t&&a.firstChild?a.insertBefore(o,a.firstChild):a.appendChild(o),o.styleSheet?o.styleSheet.cssText=e:o.appendChild(document.createTextNode(e));}}var h=".pera-wallet-modal-header {\n  position: absolute;\n  top: -44px;\n  right: 0px;\n  left: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n.pera-wallet-modal-header--mobile {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  position: static;\n}\n.pera-wallet-modal-header--mobile .pera-wallet-modal-header__close-button {\n  width: 24px;\n  height: 24px;\n  margin: 0;\n  padding: 0;\n  background: transparent;\n  border: unset;\n  box-shadow: unset;\n}\n\n.pera-wallet-modal-header__brand {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  font-size: 14px;\n  font-weight: 600;\n  line-height: 24px;\n  letter-spacing: -0.1px;\n  color: #ffffff;\n}\n\n.pera-wallet-modal-header__brand-text {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.pera-wallet-modal-header__version-number {\n  color: #9d9dae;\n  font-size: 12px;\n  font-weight: 400;\n  line-height: 18px;\n  letter-spacing: 0.01;\n}\n\n.pera-wallet-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  height: 48px;\n  padding: 14px;\n  border: none;\n  border-radius: 12px;\n  outline: none;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 14px;\n}\n\n.pera-wallet-modal-header__close-button {\n  width: 32px;\n  height: 32px;\n  margin: 0;\n  padding: 0;\n  background: rgba(44, 53, 89, 0.1);\n  border-radius: 8px;\n}\n\n.pera-wallet-modal-header__close-button__close-icon {\n  width: 20px;\n  height: 20px;\n}";w(h);const g=document.createElement("template"),x=de()?"pera-wallet-modal-header pera-wallet-modal-header--mobile":"pera-wallet-modal-header pera-wallet-modal-header--desktop";g.innerHTML=`\n  <div class="${x}">\n      ${de()?"":"<div class=\"pera-wallet-modal-header__brand\">\n              <img src=\"data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='24' height='24' rx='4.8' fill='%23FFEE55'/%3e%3cpath d='M13.0408 5.92462C13.413 7.46693 13.2872 8.8236 12.7597 8.95482C12.2322 9.08605 11.5028 7.94214 11.1306 6.39983C10.7583 4.85752 10.8842 3.50085 11.4117 3.36963C11.9391 3.2384 12.6685 4.38231 13.0408 5.92462Z' fill='black'/%3e%3cpath d='M19.1876 7.25063C18.3632 6.37689 16.7231 6.61371 15.5243 7.77959C14.3254 8.94547 14.0219 10.5989 14.8463 11.4727C15.6707 12.3464 17.3108 12.1096 18.5097 10.9437C19.7085 9.77781 20.012 8.12438 19.1876 7.25063Z' fill='black'/%3e%3cpath d='M12.6308 20.6297C13.1583 20.4985 13.2656 19.0651 12.8705 17.4281C12.4754 15.7911 11.7275 14.5705 11.2 14.7017C10.6725 14.8329 10.5652 16.2663 10.9603 17.9033C11.3554 19.5403 12.1033 20.7609 12.6308 20.6297Z' fill='black'/%3e%3cpath d='M7.25371 8.05056C8.77551 8.49933 9.8875 9.28664 9.73741 9.80906C9.58731 10.3315 8.23197 10.3912 6.71016 9.94242C5.18836 9.49364 4.07637 8.70633 4.22646 8.18391C4.37656 7.66149 5.7319 7.60178 7.25371 8.05056Z' fill='black'/%3e%3cpath d='M17.1309 13.9497C18.7461 14.4261 19.9338 15.2357 19.7837 15.7581C19.6336 16.2806 18.2025 16.3179 16.5873 15.8416C14.9721 15.3653 13.7844 14.5556 13.9345 14.0332C14.0846 13.5108 15.5157 13.4734 17.1309 13.9497Z' fill='black'/%3e%3cpath d='M8.96609 12.8536C8.5887 12.4624 7.35088 13.0318 6.20133 14.1253C5.05177 15.2188 4.42581 16.4225 4.80319 16.8137C5.18058 17.2048 6.4184 16.6355 7.56796 15.542C8.71751 14.4484 9.34347 13.2448 8.96609 12.8536Z' fill='black'/%3e%3c/svg%3e\" />\n\n              <div class=\"pera-wallet-modal-header__brand-text\">\n                <span>Pera Connect</span>\n\n                <span class=\"pera-wallet-modal-header__version-number\">v1.5.2</span>\n              </div>\n            </div>\n            "} \n\n      <button\n        id="pera-wallet-modal-header-close-button"\n        class="pera-wallet-button pera-wallet-modal-header__close-button">\n        <img\n          class="pera-wallet-modal-header__close-button__close-icon"\n          src="${de()?"data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6' stroke='%232C3559' stroke-width='2'/%3e%3c/svg%3e":"data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6' stroke='white' stroke-width='2'/%3e%3c/svg%3e"}"\n        />\n      </button>\n    </div>\n`;class f extends HTMLElement{constructor(){if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const e=document.createElement("style");e.textContent=h,this.shadowRoot.append(g.content.cloneNode(true),e),this.onClose();}}onClose(){var e;const a=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-modal-header-close-button"),o=this.getAttribute("modal-id");a&&o===Ae&&a.addEventListener("click",(()=>{Ne(Ae);}));}}var u="data:image/svg+xml,%3csvg fill='none' height='80' width='80' xmlns='http://www.w3.org/2000/svg'%3e%3cpath clip-rule='evenodd' d='M39.9 80V68.99h-9.8V80h-.2V68.99h-3.5a6.503 6.503 0 0 1-6.247-4.7 6.514 6.514 0 0 1-4.445-4.444 6.503 6.503 0 0 1-4.695-6.246v-3.5H0v-.2h11.013v-9.8H0v-.2h11.013v-9.8H0v-.2h11.013v-3.5a6.503 6.503 0 0 1 4.694-6.246 6.513 6.513 0 0 1 4.447-4.447 6.503 6.503 0 0 1 6.246-4.696h3.5V0h.2v11.011h9.8V0h.2v11.011h9.8V0h.2v11.011h3.5a6.503 6.503 0 0 1 6.247 4.697 6.514 6.514 0 0 1 4.443 4.444 6.503 6.503 0 0 1 4.701 6.248v3.5H80v.2H68.991v9.8H80v.2H68.991v9.8H80v.2H68.991v3.5a6.503 6.503 0 0 1-4.701 6.248 6.514 6.514 0 0 1-4.443 4.442 6.503 6.503 0 0 1-6.247 4.7h-3.5V80h-.2V68.99h-9.8V80zm28.89-40.1a28.728 28.728 0 0 0-1.746-9.8h-2.5v9.8h4.247zm-4.246.2h4.247a28.729 28.729 0 0 1-1.747 9.8h-2.5zm-.2-.2v-9.8H60.1v9.8zm-4.244.2h4.244v9.8H60.1zm-.2-.2a19.807 19.807 0 0 0-2.633-9.8H50.1v9.8zm-9.8.2h9.8a19.807 19.807 0 0 1-2.633 9.8H50.1zm-.2-.2v-9.8h-9.8v9.8zm-9.8.2h9.8v9.8h-9.8zm-.2-.2v-9.8h-9.8v9.8zm-9.8.2h9.8v9.8h-9.8zm-.2-.2v-9.8h-7.167a19.807 19.807 0 0 0-2.633 9.8zm-9.8.2h9.8v9.8h-7.167a19.807 19.807 0 0 1-2.633-9.8zm-.2-.2v-9.8h-4.245v9.8zm-4.245.2H19.9v9.8h-4.245zm-.2-.2v-9.8H12.96a28.726 28.726 0 0 0-1.748 9.8h4.242zm-4.242.2h4.242v9.8H12.96a28.726 28.726 0 0 1-1.748-9.8zm0 13.5v-3.5h1.608a28.876 28.876 0 0 0 2.634 5.327v2.617c0 .543.066 1.07.192 1.575a6.303 6.303 0 0 1-4.434-6.019zm4.242 1.449a28.674 28.674 0 0 1-2.42-4.949h2.42zm.2.32V50.1H19.9v9.8h-.702a28.915 28.915 0 0 1-3.543-4.53zM20.1 59.9v-9.8h2.518a20.2 20.2 0 0 0 7.282 7.282V59.9zm0-10h2.403a19.966 19.966 0 0 1-2.403-7.053zm9.8 7.25a20 20 0 0 1-7.05-7.05h7.05zm.2.117V50.1h9.8v9.8a19.807 19.807 0 0 1-9.8-2.633zm10 2.633v-9.8h9.8v7.167a19.807 19.807 0 0 1-9.8 2.633zm10-2.75V50.1h7.05a20 20 0 0 1-7.05 7.05zm0 .232a20.2 20.2 0 0 0 7.282-7.282H59.9v9.8h-9.8zm7.397-7.482H59.9v-7.053a19.966 19.966 0 0 1-2.403 7.053zm2.603 10v-9.8h4.244v5.28a28.91 28.91 0 0 1-3.538 4.52zm4.444-4.841V50.1h2.426a28.67 28.67 0 0 1-2.426 4.959zm0 .378a28.881 28.881 0 0 0 2.64-5.337h1.607v3.5a6.303 6.303 0 0 1-4.44 6.021 6.514 6.514 0 0 0 .193-1.577zm2.713-5.537h1.534v-6.477a28.817 28.817 0 0 1-1.534 6.477zm-56.044 0h1.535a28.807 28.807 0 0 1-1.535-6.477zm57.578-20v-3.5a6.303 6.303 0 0 0-4.44-6.02c.126.504.193 1.031.193 1.575v2.608a28.877 28.877 0 0 1 2.639 5.337zm-1.534.2h1.534v6.477a28.815 28.815 0 0 0-1.534-6.477zm-.288-.2a28.673 28.673 0 0 0-2.425-4.958V29.9zm-2.625 0v-5.279a28.911 28.911 0 0 0-3.538-4.521H60.1v9.8zm-4.444 0v-9.8h-9.8v2.518a20.2 20.2 0 0 1 7.282 7.282zm-2.403.2H59.9v7.053a19.966 19.966 0 0 0-2.403-7.053zm-.347-.2a20 20 0 0 0-7.05-7.05v7.05zm-7.25 0v-7.167a19.807 19.807 0 0 0-9.8-2.633v9.8zm-10 0v-9.8a19.807 19.807 0 0 0-9.8 2.633V29.9zm-10 0v-7.05a20 20 0 0 0-7.05 7.05zm-7.282 0a20.2 20.2 0 0 1 7.282-7.282V20.1h-9.8v9.8zm-2.518.2h2.403a19.966 19.966 0 0 0-2.403 7.053zm-.2-.2v-9.8h-.701a28.915 28.915 0 0 0-3.544 4.53v5.27zm-4.445 0v-4.948a28.665 28.665 0 0 0-2.42 4.948zm-2.634 0a28.874 28.874 0 0 1 2.634-5.327v-2.618c0-.543.066-1.07.191-1.574a6.303 6.303 0 0 0-4.433 6.019v3.5zm-1.608.2h1.535a28.81 28.81 0 0 0-1.535 6.477zM36.58 68.79H30.1v-1.536c2.06.749 4.23 1.27 6.479 1.535zm3.321-.001a28.726 28.726 0 0 1-9.8-1.748v-2.497h9.8zm-10-1.822v-2.423h-4.953a28.678 28.678 0 0 0 4.953 2.423zm10-2.623h-9.8V60.1h9.8zm-10 0V60.1h-9.8v.702a28.915 28.915 0 0 0 4.526 3.542H29.9zm7.254-4.444H30.1v-2.403a19.966 19.966 0 0 0 7.053 2.403zm0-39.8a19.966 19.966 0 0 0-7.054 2.403V20.1h7.053zm2.746-.2h-9.8v-4.245h9.8zm-10 0v-4.245h-5.27a28.907 28.907 0 0 0-4.53 3.544v.701zm10-4.445h-9.8V12.96a28.729 28.729 0 0 1 9.8-1.749zm-10 0v-2.421a28.668 28.668 0 0 0-4.95 2.42h4.95zm6.679-4.244a28.81 28.81 0 0 0-6.479 1.536V11.21h6.479zm-6.679 1.61v-1.61h-3.5a6.303 6.303 0 0 0-6.02 4.436 6.514 6.514 0 0 1 1.575-.192h2.617A28.877 28.877 0 0 1 29.9 12.82zm0 55.968V67.18a28.878 28.878 0 0 1-5.331-2.636h-2.614c-.543 0-1.07-.067-1.575-.192a6.303 6.303 0 0 0 6.02 4.437zm20.2 0h3.5a6.303 6.303 0 0 0 6.02-4.438 6.513 6.513 0 0 1-1.576.193h-2.608a28.879 28.879 0 0 1-5.336 2.638zm-.2-1.534v1.534h-6.475a28.808 28.808 0 0 0 6.475-1.534zm.2-.287a28.671 28.671 0 0 0 4.957-2.424H50.1v2.424zm-.2-2.424v2.499a28.728 28.728 0 0 1-9.8 1.746v-4.245zm.2-.2h5.278a28.914 28.914 0 0 0 4.522-3.538V60.1h-9.8zm-.2-4.244v4.244h-9.8V60.1zm0-2.603V59.9h-7.053a19.966 19.966 0 0 0 7.053-2.403zm0-37.397v2.403a19.966 19.966 0 0 0-7.053-2.403H49.9zm.2-.2h9.8v-.705a28.911 28.911 0 0 0-4.526-3.54H50.1V19.9zm-.2-4.245V19.9h-9.8v-4.245h9.8zm.2-.2h4.954a28.676 28.676 0 0 0-4.954-2.423zm-.2-2.497v2.497h-9.8V11.21a28.75 28.75 0 0 1 9.8 1.747zm.2-.14a28.877 28.877 0 0 1 5.332 2.637h2.612c.543 0 1.071.066 1.576.192a6.303 6.303 0 0 0-6.02-4.436h-3.5zm-.2-1.607v1.534a28.812 28.812 0 0 0-6.475-1.534H49.9zm-34.245 44.53v2.303c0 .567.075 1.117.215 1.64a6.309 6.309 0 0 0 1.643.216h1.41a29.118 29.118 0 0 1-3.268-4.16zm3.458 4.359h-1.6a6.513 6.513 0 0 1-1.578-.193 6.315 6.315 0 0 0 4.157 4.157 6.517 6.517 0 0 1-.192-1.575v-1.602a29.35 29.35 0 0 1-.787-.787zm.787.509a29.029 29.029 0 0 1-.508-.509h.508zm.2.469v1.411c0 .567.075 1.117.215 1.64.523.14 1.073.215 1.64.215h2.3a29.118 29.118 0 0 1-4.155-3.266zm35.649 3.266h2.295c.567 0 1.117-.075 1.64-.216a6.286 6.286 0 0 0 .216-1.639v-1.407a29.116 29.116 0 0 1-4.151 3.262zm4.35-3.454v1.598a6.53 6.53 0 0 1-.192 1.574 6.314 6.314 0 0 0 4.155-4.154 6.509 6.509 0 0 1-1.572.191h-1.6a29.08 29.08 0 0 1-.791.791zm.982-.991h1.41c.565 0 1.114-.075 1.636-.215a6.31 6.31 0 0 0 .216-1.641V55.75a29.113 29.113 0 0 1-3.262 4.15zm3.262-35.65v-2.295c0-.568-.075-1.117-.216-1.64a6.307 6.307 0 0 0-1.637-.215h-1.41a29.112 29.112 0 0 1 3.263 4.15zM60.89 19.9h1.6c.542 0 1.069.066 1.573.192a6.314 6.314 0 0 0-4.156-4.157 6.51 6.51 0 0 1 .192 1.576v1.598c.269.259.532.522.79.791zm-.991-.981V17.51a6.31 6.31 0 0 0-.216-1.64 6.308 6.308 0 0 0-1.64-.216h-2.299a29.108 29.108 0 0 1 4.155 3.264zm-35.641-3.264h-2.304a6.31 6.31 0 0 0-1.639.215 6.306 6.306 0 0 0-.216 1.641v1.412a29.115 29.115 0 0 1 4.159-3.268zM19.9 19.113v-1.602c0-.543.067-1.072.193-1.577a6.315 6.315 0 0 0-4.159 4.16 6.518 6.518 0 0 1 1.58-.194h1.6c.257-.267.519-.53.786-.787zm-.508.787h.508v-.508c-.171.167-.34.337-.508.508zm-.47.2h-1.409a6.31 6.31 0 0 0-1.643.216 6.308 6.308 0 0 0-.215 1.639v2.305a29.107 29.107 0 0 1 3.268-4.16zm41.178-.712c.173.168.344.34.512.512H60.1zm.513 40.712c-.169.173-.34.344-.513.513V60.1z' fill='%2394a3b8' fill-rule='evenodd'/%3e%3crect fill='black' height='80' rx='16' width='80'/%3e%3cpath d='M43.47 19.752c1.24 5.14.821 9.663-.937 10.1-1.758.438-4.19-3.375-5.43-8.517-1.241-5.14-.822-9.663.936-10.1 1.759-.438 4.19 3.376 5.43 8.517zm20.49 4.42c-2.749-2.913-8.216-2.123-12.212 1.763s-5.008 9.398-2.26 12.31 8.215 2.123 12.211-1.763 5.008-9.398 2.26-12.31zM42.102 68.769c1.758-.438 2.116-5.216.8-10.673-1.318-5.456-3.81-9.525-5.57-9.088-1.757.438-2.115 5.216-.798 10.672 1.317 5.457 3.81 9.526 5.568 9.089zM24.18 26.838c5.073 1.496 8.78 4.12 8.28 5.862-.5 1.741-5.019 1.94-10.091.444-5.073-1.496-8.78-4.12-8.28-5.861.501-1.742 5.019-1.941 10.092-.445zm32.924 19.664c5.384 1.588 9.343 4.286 8.843 6.028-.5 1.741-5.27 1.866-10.654.278-5.385-1.588-9.343-4.286-8.843-6.028.5-1.741 5.27-1.866 10.654-.278zm-27.216-3.654c-1.258-1.304-5.384.594-9.215 4.24-3.832 3.644-5.919 7.656-4.66 8.96 1.257 1.304 5.383-.594 9.215-4.239s5.918-7.657 4.66-8.96z' fill='%23fe5'/%3e%3c/svg%3e",_=".pera-wallet-download-qr-code-wrapper {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: fit-content;\n  margin: 26px auto 0;\n  padding: 10px;\n  box-shadow: 0px 20px 60px rgba(26, 35, 91, 0.15), 0px 4px 12px rgba(26, 35, 91, 0.05), 0px 1px 4px rgba(26, 35, 91, 0.06);\n  border-radius: 24px;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-download-qr-code-wrapper {\n    margin-top: 51px;\n  }\n}";w(_);const b=document.createElement("template");b.innerHTML='\n  <div id="pera-wallet-download-qr-code-wrapper" class="pera-wallet-download-qr-code-wrapper"></div>  \n';class v extends HTMLElement{constructor(){if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const e=document.createElement("style");e.textContent=_,this.shadowRoot.append(b.content.cloneNode(true),e);}}connectedCallback(){var e;const n=new s({width:205,height:205,type:"svg",data:ge,image:u,dotsOptions:{color:"#000",type:"extra-rounded"},imageOptions:{crossOrigin:"anonymous",margin:10},cornersSquareOptions:{type:"extra-rounded"},cornersDotOptions:{type:"dot"}}),t=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-download-qr-code-wrapper");t&&n.append(t);}}var C="data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M8.5 19L15.5 12L8.5 5' stroke='%233C3C49' stroke-width='2'/%3e%3c/svg%3e",k=".pera-wallet-connect-modal-desktop-mode {\n  display: grid;\n  grid-template-columns: 205px auto;\n  gap: 70px;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view {\n  display: block;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-item--active .pera-wallet-accordion-item__content {\n  height: 364px;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable .pera-wallet-accordion-item--web-wallet {\n  display: none;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable .pera-wallet-accordion-item .pera-wallet-accordion-toggle {\n  padding: 26px 24px 12px;\n  border-radius: 24px 24px 0 0;\n  transition: all ease-in 0.2s;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable .pera-wallet-accordion-item .pera-wallet-accordion-item__content {\n  height: 434px;\n  border-radius: 0 0 24px 24px;\n  transition: height ease-in 0.2s;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable .pera-wallet-accordion-item .pera-wallet-accordion-icon {\n  transform: rotate(90deg);\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable .pera-wallet-connect-modal-desktop-mode__download-pera-description {\n  margin-top: 50px;\n}\n.pera-wallet-connect-modal-desktop-mode--default .pera-wallet-connect-modal-desktop-mode__download-view {\n  display: none;\n}\n.pera-wallet-connect-modal-desktop-mode--download .pera-wallet-connect-modal-desktop-mode__default-view {\n  display: none;\n}\n.pera-wallet-connect-modal-desktop-mode--download .pera-wallet-connect-modal-desktop-mode__download-view {\n  display: block;\n}\n.pera-wallet-connect-modal-desktop-mode--download .pera-wallet-connect-modal-desktop-mode__download-view .pera-wallet-connect-modal-download-pera-view__footer a {\n  display: flex;\n  cursor: pointer;\n}\n.pera-wallet-connect-modal-desktop-mode--compact {\n  grid-template-columns: unset;\n  gap: unset;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__web-wallet {\n  padding: 28px 40px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__web-wallet .pera-wallet-connect-modal-desktop-mode__web-wallet__logo-wrapper {\n  box-shadow: unset;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__web-wallet .pera-wallet-connect-modal-desktop-mode__web-wallet__description {\n  margin-bottom: 16px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__web-wallet .pera-wallet-connect-modal-desktop-mode__web-wallet__launch-button {\n  width: 172px;\n  height: 40px;\n  margin: 0 auto;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__web-wallet-iframe {\n  height: 100%;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view {\n  overflow: hidden;\n  border-radius: 24px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-item {\n  margin-bottom: 0;\n  border-radius: 0;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-item:not(:last-child) {\n  border-bottom: 1px solid #e6e8ee;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-item #pera-wallet-iframe {\n  height: 100%;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-toggle {\n  padding: 20px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-toggle__text, .pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-toggle__content-with-label__text {\n  color: #626268;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 24px;\n  letter-spacing: -0.09px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-toggle__bold-color {\n  font-weight: 600;\n  color: #1a1a1a;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-accordion-item--active .pera-wallet-accordion-item__content {\n  height: 265px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-modal-desktop-mode__download-pera-container {\n  display: flex;\n  justify-content: space-between;\n  margin-top: 14px;\n  padding: 0 20px;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-modal-desktop-mode__download-pera-description,\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-modal-desktop-mode__download-pera-button {\n  margin: 0;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-modal-desktop-mode__download-pera-button {\n  font-weight: 500;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-qr-code-wrapper {\n  margin: 4px auto 0;\n  padding: 0;\n  box-shadow: unset;\n}\n.pera-wallet-connect-modal-desktop-mode--compact .pera-wallet-connect-modal-desktop-mode__default-view .pera-wallet-connect-qr-code-wrapper svg {\n  padding: 8px;\n  box-shadow: 0px 20px 60px rgba(26, 35, 91, 0.15), 0px 4px 12px rgba(26, 35, 91, 0.05), 0px 1px 4px rgba(26, 35, 91, 0.06);\n  border-radius: 12px;\n}\n.pera-wallet-connect-modal-desktop-mode--select-account {\n  width: 100%;\n  height: 100%;\n}\n.pera-wallet-connect-modal-desktop-mode--select-account.pera-wallet-connect-modal-desktop-mode--default {\n  overflow: hidden;\n}\n.pera-wallet-connect-modal-desktop-mode--select-account .pera-wallet-connect-modal-desktop-mode__web-wallet-iframe {\n  position: unset;\n}\n.pera-wallet-connect-modal-desktop-mode--select-account .pera-wallet-accordion {\n  overflow: hidden;\n}\n.pera-wallet-connect-modal-desktop-mode--select-account #pera-wallet-iframe {\n  position: absolute;\n  top: 0;\n  left: 0;\n  z-index: 3;\n  width: 100%;\n  height: 100%;\n  border-radius: 16px;\n}\n\n.pera-wallet-connect-modal-desktop-mode__accordion__description,\n.pera-wallet-connect-modal-desktop-mode__connect-button-wrapper {\n  padding: 0 40px 20px 64px;\n}\n\n.pera-wallet-connect-modal-desktop-mode__web-wallet {\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n  height: calc(100% - 88px);\n  padding: 48px 52px 40px;\n  margin: 0 auto;\n}\n\n.pera-wallet-connect-modal-desktop-mode__web-wallet__logo-wrapper {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 72px;\n  height: 72px;\n  margin: 0 auto 16px;\n  background: #ffffff;\n  border-radius: 50%;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.1), 0px 10px 16px rgba(20, 37, 63, 0.06);\n}\n\n.pera-wallet-connect-modal-desktop-mode__web-wallet__description {\n  margin: 0 auto 32px;\n  font-size: 14px;\n  line-height: 24px;\n  letter-spacing: -0.1px;\n  text-align: center;\n  color: #6a6a81;\n}\n\n.pera-wallet-connect-modal-desktop-mode__web-wallet__launch-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  width: 100%;\n  padding: 14px 0;\n  color: #ffffff;\n  background-color: #6b46fe;\n  border-radius: 12px;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n  letter-spacing: -0.1;\n  border: none;\n  outline: none;\n  cursor: pointer;\n}\n\n.pera-wallet-connect-modal-desktop-mode__web-wallet-iframe {\n  position: relative;\n  width: fit-content;\n  margin: 0 auto;\n}\n\n.pera-wallet-connect-modal-desktop-mode__connect-button {\n  display: block;\n  width: 100%;\n  height: 48px;\n  border: unset;\n  border-radius: 6px;\n  background-color: #333333;\n  color: white;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 13px;\n}\n\n.pera-wallet-connect-qr-code-wrapper {\n  width: fit-content;\n  margin: 24px auto 0;\n  padding: 10px;\n  box-shadow: 0px 20px 60px rgba(26, 35, 91, 0.15), 0px 4px 12px rgba(26, 35, 91, 0.05), 0px 1px 4px rgba(26, 35, 91, 0.06);\n  border-radius: 24px;\n}\n\n.pera-wallet-connect-modal-desktop-mode__download-pera-description {\n  color: #838aa6;\n  text-align: center;\n  margin: 32px 0 12px;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  letter-spacing: -0.04px;\n}\n\n.pera-wallet-connect-modal-desktop-mode__download-pera-button {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 0 auto;\n  padding: 0;\n  color: #6b46fe;\n  background-color: transparent;\n  outline: none;\n  border: none;\n  font-weight: 600;\n  font-size: 13px;\n  line-height: 20px;\n  letter-spacing: 0.01px;\n  cursor: pointer;\n}\n\n.pera-wallet-connect-modal-download-pera-view__back-button {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  margin-bottom: 14px;\n  padding: 12px 24px;\n  color: #3c3c49;\n  background-color: #ffffff;\n  outline: none;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n  border: unset;\n  border-radius: 24px;\n  font-size: 14px;\n  font-weight: 600;\n  line-height: 24px;\n  letter-spacing: -0.1px;\n  cursor: pointer;\n}\n\n.pera-wallet-connect-modal-download-pera-view {\n  padding: 32px 37px 28px;\n  background-color: #ffffff;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n  border-radius: 24px;\n}\n\n.pera-wallet-connect-modal-download-pera-view__title {\n  margin-bottom: 8px;\n  color: #3c3c49;\n  font-weight: 600;\n  font-size: 15px;\n  line-height: 18px;\n  text-align: center;\n  letter-spacing: -0.13px;\n}\n\n.pera-wallet-connect-modal-download-pera-view__footer {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  margin-top: 53px;\n}\n\n.pera-wallet-connect-modal-download-pera-view__footer__button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 8px 16px;\n  color: #6a6a81;\n  background-color: #ffffff;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n  text-decoration: none;\n  border-radius: 12px;\n  font-weight: 500;\n  font-size: 13px;\n  line-height: 200%;\n  letter-spacing: -0.04px;\n  cursor: pointer;\n}\n\n#pera-wallet-iframe {\n  width: 285px;\n  height: 376px;\n  margin: 0 auto;\n  border: none;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-connect-modal-desktop-mode {\n    grid-template-columns: 1fr;\n    gap: 24px;\n  }\n  .pera-wallet-connect-qr-code-wrapper {\n    margin-top: 16px;\n  }\n  .pera-wallet-connect-modal-download-pera-view {\n    padding: 24px;\n  }\n  .pera-wallet-download-qr-code-wrapper {\n    margin-top: 32px;\n  }\n  .pera-wallet-connect-modal-download-pera-view__footer {\n    margin-top: 40px;\n  }\n}";w(k);var y=".pera-wallet-accordion-item {\n  background-color: #ffffff;\n  border-radius: 24px;\n  box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.02), 0px 4px 12px rgba(0, 0, 0, 0.03);\n}\n.pera-wallet-accordion-item:not(:last-of-type) {\n  margin-bottom: 20px;\n}\n.pera-wallet-accordion-item:not(:last-of-type) .pera-wallet-accordion-panel {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.pera-wallet-accordion-item .pera-wallet-accordion-item__content {\n  height: 0;\n  overflow: hidden;\n  color: #69708d;\n  background-color: #ffffff;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  letter-spacing: -0.04px;\n  transition: height ease-in 0.2s;\n}\n.pera-wallet-accordion-item--active .pera-wallet-accordion-toggle {\n  padding: 26px 24px 12px;\n  border-radius: 24px 24px 0 0;\n  transition: all ease-in 0.2s;\n}\n.pera-wallet-accordion-item--active .pera-wallet-accordion-item__content {\n  border-radius: 0 0 24px 24px;\n  transition: height ease-in 0.2s;\n}\n.pera-wallet-accordion-item--active .pera-wallet-accordion-icon {\n  transform: rotate(90deg);\n}\n\n.pera-wallet-accordion-toggle {\n  position: relative;\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 12px 24px;\n  color: #2c3559;\n  background-color: #ffffff;\n  border: none;\n  border-radius: 24px;\n  outline: none;\n  cursor: pointer;\n  font-size: 16px;\n  line-height: 18px;\n  letter-spacing: -0.1px;\n  font-weight: 600;\n  transition: all ease-in 0.2s;\n}\n.pera-wallet-accordion-toggle__text, .pera-wallet-accordion-toggle__content-with-label__text {\n  color: #626268;\n}\n\n.pera-wallet-accordion-icon {\n  transition: all ease-in 0.2s;\n}\n\n.pera-wallet-accordion-toggle__bold-color {\n  color: #1A1A1A;\n  font-weight: 600;\n}\n\n.pera-wallet-accordion-toggle__content-with-label {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.pera-wallet-accordion-toggle__label {\n  padding: 4px 9px;\n  color: #1C786C;\n  background: #E0FAEE;\n  border-radius: 12px;\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 18px;\n  letter-spacing: 0.01px;\n}\n\n.pera-wallet-accordion-toggle__button {\n  position: absolute;\n  z-index: 2;\n  width: 100%;\n  height: 100%;\n  background: transparent;\n  box-shadow: none;\n  outline: none;\n  border: none;\n  cursor: pointer;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-accordion-toggle {\n    font-size: 14px;\n    font-weight: 500;\n    line-height: 24px;\n    letter-spacing: -0.1px;\n  }\n}";w(y);const L=document.createElement("template"),M=document.createElement("style"),z=document.createElement("style");M.textContent=k,z.textContent=y;L.innerHTML="\n  <div id=\"pera-wallet-connect-modal-desktop-mode\" class=\"pera-wallet-connect-modal-desktop-mode pera-wallet-connect-modal-desktop-mode--default\">\n      <pera-wallet-connect-modal-information-section></pera-wallet-connect-modal-information-section>\n\n      <div class=\"pera-wallet-connect-modal-desktop-mode__default-view\"></div>\n       \n\n      <div class=\"pera-wallet-connect-modal-desktop-mode__download-view\">\n        <button\n          id=\"pera-wallet-connect-modal-download-pera-view-back-button\"\n          class=\"pera-wallet-connect-modal-download-pera-view__back-button\">\n          <img\n            src=\"data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M10.7071 6.29387C11.0976 6.68439 11.0976 7.31756 10.7071 7.70808L7.41421 11.001L19 11.001C19.5523 11.001 20 11.4487 20 12.001C20 12.5533 19.5523 13.001 19 13.001L7.41421 13.001L10.7071 16.2939C11.0976 16.6844 11.0976 17.3176 10.7071 17.7081C10.3166 18.0986 9.68342 18.0986 9.29289 17.7081L4.29289 12.7081C4.10536 12.5205 4 12.2662 4 12.001C4 11.7358 4.10536 11.4814 4.29289 11.2939L9.29289 6.29387C9.68342 5.90335 10.3166 5.90335 10.7071 6.29387Z' fill='%233C3C49'/%3e%3c/svg%3e\"\n            alt=\"Back Arrow\"\n          />\n\n          Back\n        </button>\n\n        <div class=\"pera-wallet-connect-modal-download-pera-view\">\n          <h1 class=\"pera-wallet-connect-modal-download-pera-view__title\">\n            Download Pera Wallet\n          </h1>\n\n          <pera-wallet-download-qr-code></pera-wallet-download-qr-code>\n\n          <div class=\"pera-wallet-connect-modal-download-pera-view__footer\">\n            <a\n              href=\"https://apps.apple.com/us/app/algorand-wallet/id1459898525\"\n              target=\"_blank\"\n              rel=\"noopener noreferrer\">\n              <img src=\"data:image/svg+xml,%3csvg width='40' height='40' viewBox='0 0 40 40' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='40' height='40' rx='12' fill='black'/%3e%3cpath d='M25.6308 20.3011C25.6416 19.4664 25.8633 18.6481 26.2753 17.9221C26.6873 17.1962 27.2763 16.5863 27.9873 16.1491C27.5356 15.5039 26.9397 14.973 26.2469 14.5984C25.554 14.2239 24.7834 14.016 23.9963 13.9914C22.317 13.8151 20.6891 14.9962 19.8333 14.9962C18.9611 14.9962 17.6436 14.0089 16.2249 14.0381C15.3072 14.0677 14.4128 14.3346 13.6289 14.8126C12.8451 15.2906 12.1984 15.9636 11.7519 16.7659C9.81789 20.1144 11.2605 25.0354 13.1132 27.742C14.0401 29.0674 15.1233 30.5478 16.5408 30.4953C17.9278 30.4378 18.4458 29.6108 20.1202 29.6108C21.779 29.6108 22.265 30.4953 23.7112 30.4619C25.1995 30.4378 26.1372 29.1307 27.0316 27.7928C27.6976 26.8484 28.2101 25.8047 28.55 24.7003C27.6853 24.3345 26.9474 23.7224 26.4283 22.9401C25.9092 22.1578 25.6318 21.2399 25.6308 20.3011ZM22.8993 12.2113C23.7108 11.2371 24.1106 9.98492 24.0138 8.7207C22.7739 8.85092 21.6287 9.44347 20.8062 10.3803C20.404 10.838 20.096 11.3704 19.8998 11.9472C19.7035 12.5239 19.6229 13.1337 19.6625 13.7417C20.2826 13.7481 20.8961 13.6137 21.4568 13.3486C22.0175 13.0835 22.5107 12.6946 22.8993 12.2113Z' fill='white'/%3e%3c/svg%3e\" alt=\"App Store icon\" />\n            </a>\n\n            <a\n              href=\"https://play.google.com/store/apps/details?id=com.algorand.android\"\n              target=\"_blank\"\n              rel=\"noopener noreferrer\">\n              <img src=\"data:image/svg+xml,%3csvg width='40' height='40' viewBox='0 0 40 40' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='40' height='40' rx='12' fill='black'/%3e%3cpath d='M12.41 9.7719C12.1334 10.0219 11.9683 10.4388 11.9683 10.9922V10.8671V29.1294V29.0091C11.9683 29.5202 12.1099 29.9149 12.3497 30.169L12.4109 30.2277V30.228C12.6051 30.4035 12.854 30.4966 13.1393 30.4963C13.418 30.4963 13.7316 30.4073 14.0626 30.2194L26.0264 23.4107L30.1359 21.0717C30.6578 20.7748 30.9508 20.3917 30.9998 20.0014V19.9998C30.9508 19.6087 30.6578 19.2259 30.1359 18.9289L26.0261 16.5902L14.0627 9.78154C13.731 9.59325 13.4171 9.50391 13.1376 9.50391C12.8527 9.50391 12.6041 9.59677 12.41 9.7719H12.41Z' fill='%2300C1FF'/%3e%3cpath d='M12.411 30.2285L12.3497 30.1698C12.1099 29.9157 11.9683 29.5209 11.9683 29.0098V29.1301V10.8724V10.993C11.9683 10.4396 12.1334 10.0226 12.41 9.77268L22.622 20.0009L12.411 30.2285Z' fill='url(%23paint0_linear_173_14441)'/%3e%3cpath d='M26.0256 23.4102L22.6211 19.9996L26.0253 16.5896L30.1351 18.9283C30.657 19.2253 30.95 19.6081 30.9989 19.9993V20.0008C30.95 20.3911 30.657 20.7742 30.1351 21.0712L26.0256 23.4101' fill='url(%23paint1_linear_173_14441)'/%3e%3cpath d='M13.1374 30.4961C12.8522 30.4964 12.6033 30.4032 12.4092 30.2277V30.2275L22.6202 19.9999L26.0246 23.4104L14.0608 30.2191C13.7298 30.4071 13.4162 30.4961 13.1374 30.4961Z' fill='url(%23paint2_linear_173_14441)'/%3e%3cpath d='M22.6212 20.002L12.4092 9.7737C12.6033 9.59858 12.8519 9.50571 13.1368 9.50571C13.4163 9.50571 13.7302 9.59501 14.0618 9.78335L26.0253 16.592L22.6212 20.002' fill='url(%23paint3_linear_173_14441)'/%3e%3cpath d='M13.1394 30.6172C12.8542 30.6172 12.6049 30.524 12.4108 30.3486L12.4105 30.3489C12.4097 30.3481 12.4088 30.3473 12.4079 30.3466L12.3548 30.2947C12.3531 30.2931 12.3516 30.2912 12.3496 30.2893L12.4108 30.2279C12.6049 30.4034 12.8538 30.4966 13.1392 30.4962C13.4179 30.4962 13.7315 30.4073 14.0625 30.2193L26.0263 23.4106L26.1029 23.4874L26.0253 23.5316L14.0625 30.3398C13.7608 30.5111 13.4739 30.6004 13.2147 30.6153C13.1896 30.6165 13.1645 30.6171 13.1394 30.6172' fill='url(%23paint4_linear_173_14441)'/%3e%3cpath d='M12.3497 30.2891C12.1099 30.0349 11.9683 29.6406 11.9683 29.1292V29.0089C11.9683 29.52 12.1099 29.9146 12.3497 30.1688L12.4109 30.2275L12.3497 30.2891Z' fill='url(%23paint5_linear_173_14441)'/%3e%3cpath d='M26.1025 23.4882L26.0259 23.4114L30.1349 21.0727C30.6568 20.7758 30.9498 20.3927 30.9987 20.0025C30.9987 20.1457 30.9668 20.2889 30.9035 20.4282C30.7756 20.7091 30.5194 20.9744 30.135 21.1934L26.1025 23.4883' fill='url(%23paint6_linear_173_14441)'/%3e%3cpath d='M30.9991 20C30.9501 19.6089 30.6571 19.2261 30.1353 18.9291L26.0259 16.5907L26.1025 16.5139H26.1029L30.1353 18.8088C30.7106 19.1365 30.9987 19.5682 30.9991 20Z' fill='url(%23paint7_linear_173_14441)'/%3e%3cpath d='M11.9683 10.9922V10.8661C11.9683 10.8206 11.9695 10.7761 11.9718 10.7329V10.7309C11.9718 10.7303 11.9718 10.7297 11.972 10.729V10.7242C11.9969 10.284 12.1334 9.94066 12.3497 9.71139L12.4099 9.77198C12.1334 10.0219 11.9683 10.4388 11.9683 10.9922Z' fill='url(%23paint8_linear_173_14441)'/%3e%3cpath d='M26.026 16.5898L14.0625 9.78115C13.7308 9.59285 13.417 9.50355 13.1375 9.50355C12.8525 9.50355 12.6039 9.59642 12.4099 9.77154L12.3496 9.71091C12.3684 9.69096 12.388 9.67172 12.4082 9.65322C12.4089 9.65255 12.4099 9.65188 12.4105 9.65125C12.6031 9.47747 12.849 9.3846 13.1314 9.38293H13.1375C13.417 9.38293 13.7308 9.47227 14.0625 9.66064L26.1029 16.5128L26.1026 16.513L26.026 16.5898Z' fill='url(%23paint9_linear_173_14441)'/%3e%3cdefs%3e%3clinearGradient id='paint0_linear_173_14441' x1='18.4943' y1='10.6794' x2='9.69389' y2='19.494' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%2300A0FF'/%3e%3cstop offset='0.00657' stop-color='%2300A1FF'/%3e%3cstop offset='0.2601' stop-color='%2300BEFF'/%3e%3cstop offset='0.5122' stop-color='%2300D2FF'/%3e%3cstop offset='0.7604' stop-color='%2300DFFF'/%3e%3cstop offset='1' stop-color='%2300E3FF'/%3e%3c/linearGradient%3e%3clinearGradient id='paint1_linear_173_14441' x1='31.6348' y1='19.9407' x2='11.691' y2='19.9407' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23FFE000'/%3e%3cstop offset='0.4087' stop-color='%23FFBD00'/%3e%3cstop offset='0.7754' stop-color='orange'/%3e%3cstop offset='1' stop-color='%23FF9C00'/%3e%3c/linearGradient%3e%3clinearGradient id='paint2_linear_173_14441' x1='24.2172' y1='23.2425' x2='9.30414' y2='38.0705' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23FF3A44'/%3e%3cstop offset='1' stop-color='%23C31162'/%3e%3c/linearGradient%3e%3clinearGradient id='paint3_linear_173_14441' x1='9.77725' y1='8.25731' x2='16.4237' y2='14.876' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%2332A071'/%3e%3cstop offset='0.0685' stop-color='%232DA771'/%3e%3cstop offset='0.4762' stop-color='%2315CF74'/%3e%3cstop offset='0.8009' stop-color='%2306E775'/%3e%3cstop offset='1' stop-color='%2300F076'/%3e%3c/linearGradient%3e%3clinearGradient id='paint4_linear_173_14441' x1='24.2114' y1='25.6084' x2='12.2683' y2='37.5709' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23CC2E36'/%3e%3cstop offset='1' stop-color='%239C0E4E'/%3e%3c/linearGradient%3e%3clinearGradient id='paint5_linear_173_14441' x1='13.3285' y1='10.6804' x2='5.57625' y2='18.4453' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23008DE0'/%3e%3cstop offset='0.00657' stop-color='%23008DE0'/%3e%3cstop offset='0.2601' stop-color='%2300A7E0'/%3e%3cstop offset='0.5122' stop-color='%2300B8E0'/%3e%3cstop offset='0.7604' stop-color='%2300C4E0'/%3e%3cstop offset='1' stop-color='%2300C7E0'/%3e%3c/linearGradient%3e%3clinearGradient id='paint6_linear_173_14441' x1='31.6346' y1='20.0018' x2='11.6929' y2='20.0018' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23E0C500'/%3e%3cstop offset='0.4087' stop-color='%23E0A600'/%3e%3cstop offset='0.7754' stop-color='%23E09100'/%3e%3cstop offset='1' stop-color='%23E08900'/%3e%3c/linearGradient%3e%3clinearGradient id='paint7_linear_173_14441' x1='31.6349' y1='20.0008' x2='11.6933' y2='20.0008' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%23FFE840'/%3e%3cstop offset='0.4087' stop-color='%23FFCE40'/%3e%3cstop offset='0.7754' stop-color='%23FFBC40'/%3e%3cstop offset='1' stop-color='%23FFB540'/%3e%3c/linearGradient%3e%3clinearGradient id='paint8_linear_173_14441' x1='13.3201' y1='10.6927' x2='5.8533' y2='17.8475' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%2340B8FF'/%3e%3cstop offset='0.00657' stop-color='%2340B9FF'/%3e%3cstop offset='0.2601' stop-color='%2340CEFF'/%3e%3cstop offset='0.5122' stop-color='%2340DDFF'/%3e%3cstop offset='0.7604' stop-color='%2340E7FF'/%3e%3cstop offset='1' stop-color='%2340EAFF'/%3e%3c/linearGradient%3e%3clinearGradient id='paint9_linear_173_14441' x1='9.76302' y1='10.4182' x2='15.0961' y2='15.76' gradientUnits='userSpaceOnUse'%3e%3cstop stop-color='%2365B895'/%3e%3cstop offset='0.0685' stop-color='%2362BD95'/%3e%3cstop offset='0.4762' stop-color='%2350DB97'/%3e%3cstop offset='0.8009' stop-color='%2344ED98'/%3e%3cstop offset='1' stop-color='%2340F498'/%3e%3c/linearGradient%3e%3c/defs%3e%3c/svg%3e\" alt=\"Play Store icon\" />\n            </a>\n\n            <a\n              class=\"pera-wallet-connect-modal-download-pera-view__footer__button\"\n              href=\"https://perawallet.s3-eu-west-3.amazonaws.com/android-releases/app-pera-prod-release-bitrise-signed.apk\"\n              target=\"_blank\"\n              rel=\"noopener noreferrer\">\n              <img src=\"data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M3 14V20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20V14' stroke='%232C3559' stroke-width='1.5'/%3e%3cpath d='M11.9998 16V3M11.9998 16L7.47803 11.4783M11.9998 16L16.5215 11.4783' stroke='%232C3559' stroke-width='1.5'/%3e%3c/svg%3e\" alt=\"Download icon\" />\n\n              Download APK File\n            </a>\n          </div>\n        </div>\n      </div>\n    </div>\n  ";class E extends HTMLElement{constructor(){var e;if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){this.shadowRoot.append(L.content.cloneNode(true),M,z),this.shadowRoot.addEventListener("click",(e=>{this.handleAccordion(e);}));if("true"===this.getAttribute("compact-mode")){const e=this.shadowRoot.getElementById("pera-wallet-connect-modal-desktop-mode");null==e||e.classList.add("pera-wallet-connect-modal-desktop-mode--compact");}const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.querySelector(".pera-wallet-connect-modal-desktop-mode__default-view"),t="true"===this.getAttribute("promote-mobile"),{webWalletOption:a,mobileWalletOption:o}=function(e){const n=`\n  <div id="web-wallet-option" class="pera-wallet-accordion-item ${e?"":"pera-wallet-accordion-item--active"}  pera-wallet-accordion-item--web-wallet">\n            <a class="pera-wallet-accordion-toggle">\n              <button class="pera-wallet-accordion-toggle__button"></button>\n  \n              <img src="${C}" class="pera-wallet-accordion-icon" />\n  \n              <div class="pera-wallet-accordion-toggle__content-with-label">\n                <div class="pera-wallet-accordion-toggle__content-with-label__text">\n                  Connect With\n  \n                  <span class="pera-wallet-accordion-toggle__bold-color">\n                    Pera Web\n                  </span>\n                </div>\n  \n                <span id="pera-web-new-label" class="pera-wallet-accordion-toggle__label">NEW</span>\n              </div>\n            </a>\n  \n            <div class="pera-wallet-accordion-item__content">\n              <div class="pera-wallet-connect-modal-desktop-mode__web-wallet"><div>\n              \n              <div\n                class="pera-wallet-connect-modal-desktop-mode__web-wallet__logo-wrapper">\n                <img src="data:image/svg+xml,%3csvg width='44' height='44' viewBox='0 0 44 44' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect x='3.5' y='7.5' width='36' height='26' rx='5.5' stroke='%236B46FE' stroke-width='3'/%3e%3cpath d='M22.4973 14.5237C22.8556 16.041 22.7344 17.3757 22.2267 17.5048C21.719 17.6339 21.0169 16.5085 20.6586 14.9912C20.3003 13.4739 20.4214 12.1392 20.9292 12.0101C21.4369 11.881 22.1389 13.0064 22.4973 14.5237Z' fill='%236B46FE'/%3e%3cpath d='M28.4139 15.8282C27.6204 14.9686 26.0417 15.2016 24.8877 16.3486C23.7338 17.4956 23.4417 19.1222 24.2352 19.9818C25.0287 20.8414 26.6074 20.6084 27.7613 19.4614C28.9153 18.3144 29.2074 16.6878 28.4139 15.8282Z' fill='%236B46FE'/%3e%3cpath d='M22.1027 28.9905C22.6104 28.8614 22.7137 27.4512 22.3334 25.8407C21.9531 24.2303 21.2332 23.0294 20.7254 23.1585C20.2177 23.2876 20.1144 24.6978 20.4947 26.3083C20.875 27.9187 21.5949 29.1196 22.1027 28.9905Z' fill='%236B46FE'/%3e%3cpath d='M16.9269 16.6152C18.3917 17.0567 19.4621 17.8312 19.3176 18.3452C19.1731 18.8591 17.8686 18.9179 16.4037 18.4764C14.9389 18.0349 13.8686 17.2603 14.0131 16.7464C14.1575 16.2324 15.4621 16.1737 16.9269 16.6152Z' fill='%236B46FE'/%3e%3cpath d='M26.4342 22.4188C27.9889 22.8874 29.1322 23.6839 28.9877 24.1979C28.8432 24.7118 27.4657 24.7486 25.911 24.28C24.3563 23.8114 23.213 23.0148 23.3575 22.5009C23.502 21.9869 24.8795 21.9502 26.4342 22.4188Z' fill='%236B46FE'/%3e%3cpath d='M18.5752 21.3404C18.2119 20.9555 17.0205 21.5157 15.914 22.5915C14.8075 23.6673 14.2049 24.8514 14.5682 25.2363C14.9314 25.6211 16.1229 25.061 17.2294 23.9852C18.3359 22.9094 18.9384 21.7253 18.5752 21.3404Z' fill='%236B46FE'/%3e%3cpath d='M16 39C21 39.0001 23.5 39.0001 28 39' stroke='%236B46FE' stroke-width='3' stroke-linecap='round'/%3e%3c/svg%3e" />\n              </div>\n  \n              <p\n                class="pera-wallet-connect-modal-desktop-mode__web-wallet__description">\n                Connect with Pera Web to continue\n              </p>\n            </div>\n  \n            <button\n              id="pera-wallet-connect-web-wallet-launch-button"\n              class="pera-wallet-connect-modal-desktop-mode__web-wallet__launch-button">\n              Launch Pera Web\n  \n              <img src="data:image/svg+xml,%3csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M13.0892 9.41009C13.4147 9.73553 13.4147 10.2632 13.0892 10.5886L8.08924 15.5886C7.7638 15.914 7.23616 15.914 6.91072 15.5886C6.58529 15.2632 6.58529 14.7355 6.91072 14.4101L11.3215 9.99935L6.91073 5.5886C6.58529 5.26317 6.58529 4.73553 6.91073 4.41009C7.23616 4.08466 7.7638 4.08466 8.08924 4.41009L13.0892 9.41009Z' fill='white'/%3e%3c/svg%3e" />\n            </button>\n          </div>`,t=`\n  <div id="mobile-wallet-option" class="pera-wallet-accordion-item ${e?"pera-wallet-accordion-item--active":""}">\n            <a class="pera-wallet-accordion-toggle">\n            <button class="pera-wallet-accordion-toggle__button"></button>\n  \n              <img src="${C}" class="pera-wallet-accordion-icon" />\n  \n              <div class="pera-wallet-accordion-toggle__text">\n                Connect with\n  \n                <span class="pera-wallet-accordion-toggle__bold-color">\n                  Pera Mobile\n                </span>\n              </div>\n            </a>\n  \n            <div class="pera-wallet-accordion-item__content">\n              <div id="pera-wallet-connect-modal-connect-qr-code" class="pera-wallet-connect-qr-code-wrapper"></div>\n  \n              <div class="pera-wallet-connect-modal-desktop-mode__download-pera-container">\n                <p\n                  class="pera-wallet-connect-modal-desktop-mode__download-pera-description">\n                    Don’t have Pera Wallet app?\n                </p>\n  \n                <button\n                  id="pera-wallet-connect-modal-desktop-mode-download-pera-button"\n                  class="pera-wallet-connect-modal-desktop-mode__download-pera-button">\n                  <img src="data:image/svg+xml,%3csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect x='2' y='2' width='4.66667' height='4.66667' rx='1.2' stroke='%236B46FE' stroke-width='1.5'/%3e%3crect x='2' y='9.33203' width='4.66667' height='4.66667' rx='1.2' stroke='%236B46FE' stroke-width='1.5'/%3e%3crect x='9.33325' y='2' width='4.66667' height='4.66667' rx='1.2' stroke='%236B46FE' stroke-width='1.5'/%3e%3cpath d='M8.70581 9.5293H10.9411' stroke='%236B46FE' stroke-width='1.66667' stroke-linejoin='round'/%3e%3cpath d='M13.1765 12.668L14.6667 12.668' stroke='%236B46FE' stroke-width='1.66667' stroke-linejoin='round'/%3e%3cpath d='M13.1765 14L14.6667 14' stroke='%236B46FE' stroke-width='1.66667' stroke-linejoin='round'/%3e%3cpath d='M11.686 14L13.1762 14' stroke='%236B46FE' stroke-width='1.66667' stroke-linejoin='round'/%3e%3cpath d='M12.4314 9.5293H14.6667' stroke='%236B46FE' stroke-width='1.66667' stroke-linejoin='round'/%3e%3cpath d='M8.70581 10.2754H12.4313' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3cpath d='M10.196 11.7656H11.6862' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3cpath d='M10.196 12.5117H11.6862' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3cpath d='M8.70581 13.2539H10.196' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3cpath d='M8.70581 14H10.196' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3cpath d='M10.196 11.0195H12.4313' stroke='%236B46FE' stroke-width='1.25' stroke-linejoin='round'/%3e%3c/svg%3e" alt="QR Icon" />\n  \n                  Download Pera Wallet\n                </button>\n              </div>\n            </div>\n          </div>`;return {mobileWalletOption:document.createRange().createContextualFragment(t),webWalletOption:document.createRange().createContextualFragment(n)}}(t);t?(null==n||n.appendChild(o),null==n||n.appendChild(a)):(null==n||n.appendChild(a),null==n||n.appendChild(o));}}connectedCallback(){var e;const n=this.getAttribute("should-display-new-badge"),t=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-web-new-label");"false"===n&&(null==t||t.setAttribute("style","display:none")),this.handleChangeView();}handleChangeView(){var e,n,t;const a=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-desktop-mode-download-pera-button"),o=null===(n=this.shadowRoot)||void 0===n?void 0:n.getElementById("pera-wallet-connect-modal-download-pera-view-back-button"),l=null===(t=this.shadowRoot)||void 0===t?void 0:t.getElementById("pera-wallet-connect-web-wallet-launch-button");a&&a.addEventListener("click",(()=>{this.onClickDownload();})),o&&o.addEventListener("click",(()=>{this.onClickBack();})),l&&l.addEventListener("click",(()=>{this.webWalletConnect();})),this.renderQRCode(),this.checkWebWalletAvaliability();}webWalletConnect(){"true"===this.getAttribute("is-web-wallet-avaliable")&&window.onWebWalletConnect();}handleAccordion(e){var n,t;if(e.target instanceof Element){if(!e.target.classList.contains("pera-wallet-accordion-toggle__button"))return;if(this.shadowRoot&&(null===(n=e.target.parentElement)||void 0===n?void 0:n.parentElement)){const n=null===(t=e.target.parentElement)||void 0===t?void 0:t.parentElement;if(!n)return;if(n.classList.contains("pera-wallet-accordion-item--active"))return;const a=this.shadowRoot.querySelectorAll(".pera-wallet-accordion-item.pera-wallet-accordion-item--active");for(let e=0;e<a.length;e++)a[e].classList.remove("pera-wallet-accordion-item--active");n.classList.toggle("pera-wallet-accordion-item--active");}}}renderQRCode(){var e;const n=this.getAttribute("is-web-wallet-avaliable"),t="true"===this.getAttribute("compact-mode"),a="true"===this.getAttribute("single-account");let o=this.getAttribute("uri");a&&(o=`${o}&singleAccount=true`);let l="false"===n?250:205;if(t&&(l=190),o){const n=new s({width:l,height:l,type:"svg",data:o,image:u,dotsOptions:{color:"#000",type:"extra-rounded"},imageOptions:{crossOrigin:"anonymous",margin:8},cornersSquareOptions:{type:"extra-rounded"},cornersDotOptions:{type:"dot"}}),t=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-connect-qr-code");t&&n.append(t);}}onClickDownload(){if(this.shadowRoot){const e=this.shadowRoot.getElementById("pera-wallet-connect-modal-desktop-mode");e&&(e.classList.remove("pera-wallet-connect-modal-desktop-mode--default"),e.classList.add("pera-wallet-connect-modal-desktop-mode--download"));}}onClickBack(){if(this.shadowRoot){const e=this.shadowRoot.getElementById("pera-wallet-connect-modal-desktop-mode");e&&(e.classList.add("pera-wallet-connect-modal-desktop-mode--default"),e.classList.remove("pera-wallet-connect-modal-desktop-mode--download"));}}checkWebWalletAvaliability(){var e;if("false"===this.getAttribute("is-web-wallet-avaliable")){const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.querySelector(".pera-wallet-connect-modal-desktop-mode__default-view");null==n||n.classList.add("pera-wallet-connect-modal-desktop-mode__default-view--web-wallet-not-avaliable");}}}var Z=".pera-wallet-connect-modal-touch-screen-mode {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 46px;\n  padding: 4px;\n}\n\n.pera-wallet-connect-modal-touch-screen-mode--pending-message-view {\n  gap: 56px;\n  grid-template-rows: auto 48px;\n  height: 100%;\n  padding-bottom: 70px;\n}\n\n.pera-wallet-connect-modal-touch-screen-mode__launch-pera-wallet-button,\n.pera-wallet-connect-modal-touch-screen-mode__install-pera-wallet-button {\n  display: block;\n  padding: 14px;\n  border-radius: 12px;\n  text-decoration: none;\n  text-align: center;\n  font-size: 14px;\n  line-height: 20px;\n  letter-spacing: -0.09px;\n  font-weight: 500;\n}\n\n.pera-wallet-connect-modal-touch-screen-mode__launch-pera-wallet-button {\n  margin-bottom: 32px;\n  background-color: #6b46fe;\n  color: #ffffff;\n}\n\n.pera-wallet-connect-modal-touch-screen-mode__install-pera-wallet-button {\n  margin-bottom: 20px;\n  color: #6a6a81;\n  background-color: #ffffff;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n}\n\n.pera-wallet-connect-modal-touch-screen-mode__new-to-pera-box {\n  position: relative;\n  margin-bottom: 32px;\n  border-top: 1px solid #e6e8ee;\n}\n\n.pera-wallet-connect-modal-touch-screen-mode__new-to-pera-box__text {\n  position: absolute;\n  top: -25px;\n  right: calc(50% - 56px);\n  width: 116px;\n  color: #69708d;\n  background-color: #ffffff;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 24px;\n  letter-spacing: -0.04px;\n  text-align: center;\n}";w(Z);const H=document.createElement("template");class B extends HTMLElement{constructor(){var e;if(super(),this.attachShadow({mode:"open"}),H.innerHTML='\n  <div class="pera-wallet-connect-modal-touch-screen-mode">\n    <pera-wallet-connect-modal-information-section></pera-wallet-connect-modal-information-section>\n\n    <div>\n      <a\n        id="pera-wallet-connect-modal-touch-screen-mode-launch-pera-wallet-button"\n        class="pera-wallet-connect-modal-touch-screen-mode__launch-pera-wallet-button"\n        rel="noopener noreferrer"\n        target="_blank">\n        Launch Pera Wallet\n      </a>\n\n      <div\n        class="pera-wallet-connect-modal-touch-screen-mode__new-to-pera-box">\n        <p\n          class="pera-wallet-connect-modal-touch-screen-mode__new-to-pera-box__text"\n          >\n          New to Pera?\n        </p>\n      </div>\n\n      <a\n        href="https://perawallet.app/download/"\n        class="pera-wallet-connect-modal-touch-screen-mode__install-pera-wallet-button"\n        rel="noopener noreferrer"\n        target="_blank">\n        Install Pera Wallet\n      </a>\n    </div>\n  </div>\n',this.shadowRoot){const n=document.createElement("style");n.textContent=Z,this.shadowRoot.append(H.content.cloneNode(true),n);const t=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-touch-screen-mode-launch-pera-wallet-button"),a=this.getAttribute("uri"),l="true"===this.getAttribute("single-account"),i=this.getAttribute("selected-account")||void 0;t&&a&&(t.setAttribute("href",me(a,{singleAccount:l,selectedAccount:i})),t.addEventListener("click",(()=>{this.onClickLaunch();})));}}onClickLaunch(){if(H.innerHTML=`\n    <div class="pera-wallet-connect-modal-touch-screen-mode pera-wallet-connect-modal-touch-screen-mode--pending-message-view">\n      <pera-wallet-connect-modal-pending-message-section should-use-sound="${this.getAttribute("should-use-sound")}"></pera-wallet-connect-modal-pending-message-section>\n    </div>\n  `,this.shadowRoot){const e=document.createElement("style");e.textContent=Z,this.shadowRoot.innerHTML="",this.shadowRoot.append(H.content.cloneNode(true),e);}}}var F='@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");\n.pera-wallet-modal {\n  --pera-wallet-modal-font-family: "Inter", sans-serif;\n  --pera-wallet-modal-compact-width: 380px;\n  --pera-wallet-modal-compact-height: 396px;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  position: fixed;\n  top: 0;\n  right: 0;\n  left: 0;\n  bottom: 0;\n  z-index: 999999;\n  width: 100vw;\n  height: 100vh;\n  background-color: rgba(0, 0, 0, 0.7);\n}\n.pera-wallet-modal--select-account .pera-wallet-modal__body {\n  width: 480px;\n  height: 578px;\n  background-color: #ffffff;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body {\n  position: absolute;\n  top: unset;\n  bottom: 0;\n  left: 0;\n  width: 100%;\n  max-width: unset;\n  padding: 20px;\n  background-color: #ffffff;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);\n  border-radius: 20px 20px 0px 0px;\n  animation: 0.3s PeraWalletConnectMobileSlideIn ease-out;\n  overflow-y: auto;\n  transform: unset;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body::before {\n  background-image: unset;\n}\n.pera-wallet-modal--compact:not(.pera-wallet-modal--mobile) .pera-wallet-modal__body {\n  width: var(--pera-wallet-modal-compact-width);\n  height: var(--pera-wallet-modal-compact-height);\n  padding: 0;\n}\n.pera-wallet-modal * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.pera-wallet-modal ul,\n.pera-wallet-modal ol,\n.pera-wallet-modal li {\n  list-style-type: none;\n}\n\n.pera-wallet-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  height: 48px;\n  padding: 14px;\n  border: none;\n  border-radius: 12px;\n  outline: none;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 14px;\n}\n\n.pera-wallet-modal__logo img {\n  display: block;\n  width: 32px;\n}\n\n.pera-wallet-modal__body {\n  position: relative;\n  top: 50%;\n  left: 50%;\n  width: 700px;\n  max-width: calc(100vw - 80px);\n  padding: 28px;\n  background-color: #f3f3f7;\n  box-shadow: 1px 2px 2px rgba(0, 0, 0, 0.08);\n  border-radius: 24px;\n  animation: 0.3s PeraWalletConnectSlideIn ease-out;\n  transform: translate(-50%, -50%);\n}\n.pera-wallet-modal__body::before {\n  --background-line: #1e0972 0 1.2px, transparent 0 calc(100% - 1.2px), #1e0972;\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  z-index: -1;\n  content: "";\n  background-image: linear-gradient(var(--background-line)), linear-gradient(90deg, var(--background-line));\n  background-size: 116px 116px;\n  mix-blend-mode: overlay;\n  border-radius: 24px;\n  opacity: 0.8;\n  pointer-events: none;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-modal--desktop .pera-wallet-modal__body {\n    width: 100%;\n    max-width: calc(100vw - 32px);\n    padding: 24px;\n  }\n}\n@keyframes PeraWalletConnectSlideIn {\n  0% {\n    opacity: 0;\n    transform: translate(-50%, calc(-50% + 24px));\n  }\n  100% {\n    opacity: 1;\n    transform: translate(-50%, -50%);\n  }\n}\n@keyframes PeraWalletConnectMobileSlideIn {\n  0% {\n    bottom: -30%;\n    opacity: 0;\n  }\n  100% {\n    bottom: 0;\n    opacity: 1;\n  }\n}';w(F);const A=document.createElement("template");let V=de()?`${Re} ${Re}--mobile`:`${Re} ${Re}--desktop`;class R extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"});}connectedCallback(){this.shadowRoot&&this.render();}render(){if(!this.shadowRoot)return;const n=document.createElement("style");n.textContent=F;"true"===this.getAttribute("compact-mode")&&(V=`${V} ${Re}--compact`);const t="true"===this.getAttribute("single-account"),a=this.getAttribute("selected-account")||void 0;de()?(A.innerHTML=`\n          <div class="${V}">\n            <div class="pera-wallet-modal__body" part="body">\n              <pera-wallet-modal-header modal-id="${be}"></pera-wallet-modal-header/>\n        \n              <pera-wallet-modal-touch-screen-mode uri="${this.getAttribute("uri")}" should-use-sound="${this.getAttribute("should-use-sound")}" single-account="${t}" selected-account="${a}"></pera-wallet-modal-touch-screen-mode>\n            </div>\n          </div>\n        `,this.shadowRoot.append(A.content.cloneNode(true),n)):(A.innerHTML=`\n        <div class="${V}">\n          <div class="pera-wallet-modal__body">\n            <pera-wallet-modal-header modal-id="${be}"></pera-wallet-modal-header/>\n      \n            <pera-wallet-modal-desktop-mode id="pera-wallet-modal-desktop-mode" uri="${this.getAttribute("uri")}" is-web-wallet-avaliable="${this.getAttribute("is-web-wallet-avaliable")}" should-display-new-badge="${this.getAttribute("should-display-new-badge")}" compact-mode="${this.getAttribute("compact-mode")}" promote-mobile="${this.getAttribute("promote-mobile")}" single-account="${t}"\n        ></pera-wallet-modal-desktop-mode>\n          </div>\n        </div>\n      `,this.shadowRoot.append(A.content.cloneNode(true),n));}}var I='@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");\n.pera-wallet-modal {\n  --pera-wallet-modal-font-family: "Inter", sans-serif;\n  --pera-wallet-modal-compact-width: 380px;\n  --pera-wallet-modal-compact-height: 396px;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  position: fixed;\n  top: 0;\n  right: 0;\n  left: 0;\n  bottom: 0;\n  z-index: 999999;\n  width: 100vw;\n  height: 100vh;\n  background-color: rgba(0, 0, 0, 0.7);\n}\n.pera-wallet-modal--select-account .pera-wallet-modal__body {\n  width: 480px;\n  height: 578px;\n  background-color: #ffffff;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body {\n  position: absolute;\n  top: unset;\n  bottom: 0;\n  left: 0;\n  width: 100%;\n  max-width: unset;\n  padding: 20px;\n  background-color: #ffffff;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);\n  border-radius: 20px 20px 0px 0px;\n  animation: 0.3s PeraWalletConnectMobileSlideIn ease-out;\n  overflow-y: auto;\n  transform: unset;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body::before {\n  background-image: unset;\n}\n.pera-wallet-modal--compact:not(.pera-wallet-modal--mobile) .pera-wallet-modal__body {\n  width: var(--pera-wallet-modal-compact-width);\n  height: var(--pera-wallet-modal-compact-height);\n  padding: 0;\n}\n.pera-wallet-modal * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.pera-wallet-modal ul,\n.pera-wallet-modal ol,\n.pera-wallet-modal li {\n  list-style-type: none;\n}\n\n.pera-wallet-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  height: 48px;\n  padding: 14px;\n  border: none;\n  border-radius: 12px;\n  outline: none;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 14px;\n}\n\n.pera-wallet-modal__logo img {\n  display: block;\n  width: 32px;\n}\n\n.pera-wallet-modal__body {\n  position: relative;\n  top: 50%;\n  left: 50%;\n  width: 700px;\n  max-width: calc(100vw - 80px);\n  padding: 28px;\n  background-color: #f3f3f7;\n  box-shadow: 1px 2px 2px rgba(0, 0, 0, 0.08);\n  border-radius: 24px;\n  animation: 0.3s PeraWalletConnectSlideIn ease-out;\n  transform: translate(-50%, -50%);\n}\n.pera-wallet-modal__body::before {\n  --background-line: #1e0972 0 1.2px, transparent 0 calc(100% - 1.2px), #1e0972;\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  z-index: -1;\n  content: "";\n  background-image: linear-gradient(var(--background-line)), linear-gradient(90deg, var(--background-line));\n  background-size: 116px 116px;\n  mix-blend-mode: overlay;\n  border-radius: 24px;\n  opacity: 0.8;\n  pointer-events: none;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-modal--desktop .pera-wallet-modal__body {\n    width: 100%;\n    max-width: calc(100vw - 32px);\n    padding: 24px;\n  }\n}\n@keyframes PeraWalletConnectSlideIn {\n  0% {\n    opacity: 0;\n    transform: translate(-50%, calc(-50% + 24px));\n  }\n  100% {\n    opacity: 1;\n    transform: translate(-50%, -50%);\n  }\n}\n@keyframes PeraWalletConnectMobileSlideIn {\n  0% {\n    bottom: -30%;\n    opacity: 0;\n  }\n  100% {\n    bottom: 0;\n    opacity: 1;\n  }\n}\n.pera-wallet-redirect-modal {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 56px;\n  grid-template-rows: auto 48px;\n  height: 100%;\n  padding: 4px;\n  padding-bottom: 70px;\n}\n\n.pera-wallet-redirect-modal__content {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n}\n\n.pera-wallet-redirect-modal__content__title {\n  margin: 20px 0 8px;\n  color: #3c3c49;\n  font-size: 18px;\n  font-weight: 600;\n  line-height: 22px;\n  letter-spacing: -0.26px;\n}\n\n.pera-wallet-redirect-modal__content__description,\n.pera-wallet-redirect-modal__content__install-pera-text {\n  color: #3c3c49;\n  max-width: 271px;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 24px;\n  letter-spacing: -0.09px;\n  text-align: center;\n}\n\n.pera-wallet-redirect-modal__content__description {\n  margin-bottom: 24px;\n}\n\n.pera-wallet-redirect-modal__content__install-pera-text__link {\n  color: #6b46fe;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 24px;\n  letter-spacing: -0.09px;\n  text-align: center;\n}\n\n.pera-wallet-redirect-modal__launch-pera-wallet-button {\n  display: block;\n  padding: 14px;\n  color: #ffffff;\n  background-color: #6b46fe;\n  border-radius: 12px;\n  text-decoration: none;\n  text-align: center;\n  font-size: 14px;\n  line-height: 20px;\n  letter-spacing: -0.09px;\n  font-weight: 500;\n}';w(I);const S=document.createElement("template");S.innerHTML=`\n  <div class="pera-wallet-modal pera-wallet-modal--mobile">\n    <div class="pera-wallet-modal__body">\n      <pera-wallet-modal-header modal-id="${Ae}"></pera-wallet-modal-header/>\n\n      <div class="pera-wallet-redirect-modal">\n        <div class="pera-wallet-redirect-modal__content">\n          <img src="data:image/svg+xml,%3csvg width='120' height='38' viewBox='0 0 120 38' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cg clip-path='url(%23clip0_38844_290434)'%3e%3cpath d='M103.739 28.6746H109.565' stroke='%236B46FE' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3e%3cpath d='M112.25 37H100.75C97.5731 37 95 34.2336 95 30.8182V9.18182C95 5.76636 97.5731 3 100.75 3H112.25C115.427 3 118 5.76636 118 9.18182V30.8182C118 34.2336 115.427 37 112.25 37Z' fill='%236B46FE' fill-opacity='0.1' stroke='%236B46FE' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3e%3crect y='1' width='36' height='36' rx='7.76829' fill='%236B46FE' fill-opacity='0.1'/%3e%3cpath d='M19.6057 9.47351C20.1851 11.8819 19.9967 14.0022 19.1848 14.2093C18.373 14.4164 17.2452 12.6319 16.6658 10.2235C16.0864 7.81514 16.2748 5.69486 17.0867 5.48775C17.8985 5.28063 19.0263 7.06512 19.6057 9.47351Z' fill='%236B46FE'/%3e%3cpath d='M29.0775 11.5213C27.8045 10.1593 25.2795 10.5358 23.4378 12.3621C21.5961 14.1885 21.1352 16.7732 22.4083 18.1352C23.6814 19.4972 26.2064 19.1207 28.048 17.2943C29.8897 15.4679 30.3506 12.8832 29.0775 11.5213Z' fill='%236B46FE'/%3e%3cpath d='M19.0324 32.4518C19.8443 32.2446 20.0039 30.0045 19.3889 27.4483C18.774 24.8921 17.6173 22.9877 16.8055 23.1948C15.9937 23.402 15.834 25.6421 16.449 28.1983C17.064 30.7545 18.2206 32.6589 19.0324 32.4518Z' fill='%236B46FE'/%3e%3cpath d='M10.7016 12.818C13.0471 13.5132 14.7627 14.739 14.5336 15.5559C14.3045 16.3728 12.2175 16.4714 9.87199 15.7762C7.52653 15.0809 5.81087 13.8551 6.03996 13.0383C6.26906 12.2214 8.35615 12.1228 10.7016 12.818Z' fill='%236B46FE'/%3e%3cpath d='M25.9365 21.9967C28.4259 22.7346 30.2583 23.995 30.0292 24.8119C29.8001 25.6287 27.5963 25.6927 25.1069 24.9548C22.6174 24.2169 20.7851 22.9565 21.0141 22.1397C21.2432 21.3228 23.447 21.2588 25.9365 21.9967Z' fill='%236B46FE'/%3e%3cpath d='M13.3578 20.316C12.775 19.7063 10.8709 20.6007 9.10487 22.3139C7.33879 24.0271 6.37952 25.9102 6.96226 26.5199C7.54501 27.1297 9.4491 26.2352 11.2152 24.522C12.9813 22.8089 13.9405 20.9258 13.3578 20.316Z' fill='%236B46FE'/%3e%3cpath d='M70.2098 10L75.3049 15.0945L52 15.0945' stroke='%23D0CAE7' stroke-width='3'/%3e%3cpath d='M60.7902 29.5945L55.6951 24.5L79 24.5' stroke='%23D0CAE7' stroke-width='3'/%3e%3c/g%3e%3cdefs%3e%3cclipPath id='clip0_38844_290434'%3e%3crect width='120' height='38' fill='white'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e" />\n\n          <h1 class="pera-wallet-redirect-modal__content__title">\n            Can't Launch Pera\n          </h1>\n\n          <p class="pera-wallet-redirect-modal__content__description">\n            We couldn't redirect you to Pera Wallet automatically. Please try again.\n          </p>\n\n          <p class="pera-wallet-redirect-modal__content__install-pera-text">\n            Don't have Pera Wallet installed yet?\n            <br />\n            \n            <a\n              id="pera-wallet-redirect-modal-download-pera-link"\n              class="pera-wallet-redirect-modal__content__install-pera-text__link"\n              href="https://perawallet.app/download/"\n              rel="noopener noreferrer"\n              target="_blank">\n              Tap here to install.\n            </a>\n          </p>\n        </div>\n\n        <a\n          id="pera-wallet-redirect-modal-launch-pera-link"\n          class="pera-wallet-redirect-modal__launch-pera-wallet-button"\n          rel="noopener noreferrer"\n          target="_blank">\n          Launch Pera Wallet\n        </a>\n      </div>\n    </div>\n  </div>\n`;class W extends HTMLElement{constructor(){var e,n;if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const t=document.createElement("style");t.textContent=I,this.shadowRoot.append(S.content.cloneNode(true),t);const a=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-redirect-modal-download-pera-link");null==a||a.addEventListener("click",(()=>{this.onClose();}));const o=null===(n=this.shadowRoot)||void 0===n?void 0:n.getElementById("pera-wallet-redirect-modal-launch-pera-link");null==o||o.addEventListener("click",(()=>{this.onClose(),window.open(ye(),"_blank");}));}}connectedCallback(){const e=window.open(ye(),"_blank");e&&!e.closed&&this.onClose();}onClose(){Ne(Ae);}}var P="data:image/svg+xml,%3csvg width='32' height='35' viewBox='0 0 32 35' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M18.2837 5.09271C19.0234 8.12325 18.7827 10.7913 17.7463 11.0519C16.7098 11.3126 15.27 9.06712 14.5304 6.03657C13.7908 3.00603 14.0315 0.337996 15.0679 0.0773547C16.1044 -0.183287 17.5441 2.06216 18.2837 5.09271Z' fill='%233C3C49'/%3e%3cpath d='M30.376 7.66915C28.7507 5.95537 25.5271 6.42918 23.1759 8.72745C20.8247 11.0257 20.2361 14.2781 21.8614 15.9919C23.4866 17.7057 26.7102 17.2319 29.0614 14.9336C31.4127 12.6354 32.0012 9.38294 30.376 7.66915Z' fill='%233C3C49'/%3e%3cpath d='M17.5511 34.0071C18.5876 33.7465 18.7914 30.9276 18.0064 27.711C17.2214 24.4945 15.7448 22.0982 14.7084 22.3589C13.6719 22.6195 13.4681 25.4383 14.2531 28.6549C15.0381 31.8715 16.5147 34.2677 17.5511 34.0071Z' fill='%233C3C49'/%3e%3cpath d='M6.91617 9.3015C9.9105 10.1763 12.1008 11.7187 11.8083 12.7466C11.5158 13.7745 8.85126 13.8986 5.85693 13.0239C2.8626 12.1491 0.672334 10.6067 0.964835 9.57881C1.25734 8.5509 3.92184 8.42674 6.91617 9.3015Z' fill='%233C3C49'/%3e%3cpath d='M26.3656 20.8508C29.5437 21.7793 31.883 23.3652 31.5905 24.3932C31.298 25.4211 28.4845 25.5017 25.3063 24.5732C22.1282 23.6448 19.7889 22.0588 20.0814 21.0309C20.3739 20.003 23.1874 19.9224 26.3656 20.8508Z' fill='%233C3C49'/%3e%3cpath d='M10.3069 18.7365C9.56299 17.9692 7.13209 19.0948 4.87736 21.2506C2.62264 23.4064 1.39791 25.776 2.14185 26.5432C2.8858 27.3105 5.3167 26.1849 7.57143 24.0291C9.82615 21.8733 11.0509 19.5037 10.3069 18.7365Z' fill='%233C3C49'/%3e%3c/svg%3e",j=".pera-wallet-connect-modal-information-section {\n  padding: 12px;\n  padding-right: 0;\n}\n.pera-wallet-connect-modal-information-section--mobile {\n  padding: 0;\n}\n.pera-wallet-connect-modal-information-section--mobile .pera-wallet-connect-modal-information-section__pera-icon {\n  margin-bottom: 16px;\n}\n.pera-wallet-connect-modal-information-section--mobile .pera-wallet-connect-modal-information-section__connect-pera-title {\n  margin-bottom: 8px;\n  color: #3c3c49;\n  font-size: 18px;\n  font-weight: 600;\n  line-height: 22px;\n  letter-spacing: -0.2px;\n}\n.pera-wallet-connect-modal-information-section--mobile .pera-wallet-connect-modal-information-section__title {\n  margin-bottom: 24px;\n  color: #3c3c49;\n  font-size: 14px;\n  line-height: 24px;\n  letter-spacing: -0.09px;\n  font-weight: 400;\n}\n.pera-wallet-connect-modal-information-section--mobile .pera-wallet-connect-modal-information-section__features-item__icon-wrapper {\n  background-color: #f2f3f8;\n}\n.pera-wallet-connect-modal-information-section--mobile .pera-wallet-connect-modal-information-section__features-item__description {\n  color: #6a6a81;\n}\n.pera-wallet-connect-modal-information-section * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n\n.pera-wallet-connect-modal-information-section__pera-icon {\n  margin-bottom: 32px;\n}\n\n.pera-wallet-connect-modal-information-section__title {\n  margin-bottom: 148px;\n  color: #3c3c49;\n  font-size: 20px;\n  font-weight: 500;\n  line-height: 24px;\n  letter-spacing: -0.5px;\n}\n\n.pera-wallet-connect-modal-information-section__secondary-title {\n  margin-bottom: 20px;\n  color: #9d9dae;\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 18px;\n  letter-spacing: 0.06px;\n  text-transform: uppercase;\n}\n\n.pera-wallet-connect-modal-information-section__features-item {\n  display: grid;\n  align-items: center;\n  grid-template-columns: 36px auto;\n  gap: 16px;\n}\n.pera-wallet-connect-modal-information-section__features-item:not(:last-of-type) {\n  margin-bottom: 24px;\n}\n\n.pera-wallet-connect-modal-information-section__features-item__icon-wrapper {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 36px;\n  height: 36px;\n  background-color: #ffffff;\n  border-radius: 50%;\n}\n\n.pera-wallet-connect-modal-information-section__features-item__description {\n  color: #6a6a81;\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n  letter-spacing: 0.01px;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-connect-modal-information-section--desktop {\n    padding: 0;\n  }\n  .pera-wallet-connect-modal-information-section--desktop .pera-wallet-connect-modal-information-section__pera-icon {\n    margin-bottom: 12px;\n  }\n  .pera-wallet-connect-modal-information-section--desktop .pera-wallet-connect-modal-information-section__title {\n    margin-bottom: 24px;\n    font-size: 16px;\n    font-weight: 500;\n    line-height: 24px;\n    letter-spacing: -0.26px;\n  }\n  .pera-wallet-connect-modal-information-section--desktop .pera-wallet-connect-modal-information-section__features-item {\n    display: none;\n  }\n  .pera-wallet-connect-modal-information-section__secondary-title {\n    display: none;\n  }\n}";w(j);const T=document.createElement("template"),$=de()?"pera-wallet-connect-modal-information-section pera-wallet-connect-modal-information-section--mobile":"pera-wallet-connect-modal-information-section pera-wallet-connect-modal-information-section--desktop";T.innerHTML=`\n  <section class="${$}">\n    <img\n      id="pera-wallet-connect-modal-information-section-pera-icon"\n      src="${P}"\n      class="pera-wallet-connect-modal-information-section__pera-icon"\n      alt="Pera Wallet Logo"\n    />\n\n    <h1 id="pera-wallet-connect-modal-information-section-connect-pera-mobile" class="pera-wallet-connect-modal-information-section__connect-pera-title">\n        Connect to Pera Wallet\n    </h1>\n\n    <h1 class="pera-wallet-connect-modal-information-section__title">\n      Simply the best Algorand wallet.\n    </h1>\n\n    <h2 id="pera-wallet-connect-modal-information-section-secondary-title" class="pera-wallet-connect-modal-information-section__secondary-title">\n      Features\n    </h2>\n\n    <ul>\n      <li class="pera-wallet-connect-modal-information-section__features-item">\n        <div class="pera-wallet-connect-modal-information-section__features-item__icon-wrapper">\n          <img src="data:image/svg+xml,%3csvg width='20' height='21' viewBox='0 0 20 21' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M2.5 10.1378C2.5 10.8378 3.025 11.6461 3.66667 11.9294L9.325 14.4461C9.75833 14.6378 10.25 14.6378 10.675 14.4461L16.3333 11.9294C16.975 11.6461 17.5 10.8378 17.5 10.1378M2.5 14.3044C2.5 15.0794 2.95833 15.7794 3.66667 16.0961L9.325 18.6128C9.75833 18.8044 10.25 18.8044 10.675 18.6128L16.3333 16.0961C17.0417 15.7794 17.5 15.0794 17.5 14.3044M10.8417 3.4043L15.7583 5.58763C17.175 6.21263 17.175 7.24596 15.7583 7.87096L10.8417 10.0543C10.2833 10.3043 9.36668 10.3043 8.80835 10.0543L3.89168 7.87096C2.47502 7.24596 2.47502 6.21263 3.89168 5.58763L8.80835 3.4043C9.36668 3.1543 10.2833 3.1543 10.8417 3.4043Z' stroke='%239D9DAE' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e" alt="Layer Icon" />\n        </div>\n        \n        <p\n          class="pera-wallet-connect-modal-information-section__features-item__description">\n          Connect to any Algorand dApp securely\n        </p>\n      </li>\n\n      <li class="pera-wallet-connect-modal-information-section__features-item">\n        <div\n          class="pera-wallet-connect-modal-information-section__features-item__icon-wrapper">\n          <img src="data:image/svg+xml,%3csvg width='24' height='25' viewBox='0 0 24 25' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M9.58033 12.3109C9.28744 12.018 8.81257 12.018 8.51967 12.3109C8.22678 12.6038 8.22678 13.0787 8.51967 13.3716L9.58033 12.3109ZM10.66 14.4512L10.1297 14.9816C10.4226 15.2745 10.8974 15.2745 11.1903 14.9816L10.66 14.4512ZM15.4903 10.6816C15.7832 10.3887 15.7832 9.91381 15.4903 9.62092C15.1974 9.32803 14.7226 9.32803 14.4297 9.62092L15.4903 10.6816ZM19.84 8.09125C19.84 8.50546 20.1758 8.84125 20.59 8.84125C21.0042 8.84125 21.34 8.50546 21.34 8.09125H19.84ZM18.5 5.07125L18.2368 5.77355L18.2373 5.77375L18.5 5.07125ZM13.51 3.20125L13.7732 2.49894L13.7724 2.49866L13.51 3.20125ZM10.49 3.20125L10.2276 2.49865L10.2256 2.49941L10.49 3.20125ZM5.5 5.08125L5.76268 5.78375L5.76442 5.78309L5.5 5.08125ZM5.14 18.9612L4.69102 19.562L4.69135 19.5623L5.14 18.9612ZM9.44 22.1713L9.89069 21.5718L9.88866 21.5702L9.44 22.1713ZM14.58 22.1713L14.1313 21.5702L14.1293 21.5718L14.58 22.1713ZM18.88 18.9612L19.3287 19.5623L19.329 19.562L18.88 18.9612ZM21.36 8.09125C21.36 7.67704 21.0242 7.34125 20.61 7.34125C20.1958 7.34125 19.86 7.67704 19.86 8.09125H21.36ZM8.51967 13.3716L10.1297 14.9816L11.1903 13.9209L9.58033 12.3109L8.51967 13.3716ZM11.1903 14.9816L15.4903 10.6816L14.4297 9.62092L10.1297 13.9209L11.1903 14.9816ZM21.34 8.09125C21.34 7.29392 21.0398 6.50041 20.5931 5.85456C20.1463 5.20881 19.5097 4.64807 18.7627 4.36875L18.2373 5.77375C18.6403 5.92443 19.0487 6.25869 19.3595 6.70794C19.6702 7.15709 19.84 7.65858 19.84 8.09125H21.34ZM18.7632 4.36895L13.7732 2.49895L13.2468 3.90355L18.2368 5.77355L18.7632 4.36895ZM13.7724 2.49866C13.2479 2.30277 12.6051 2.21875 12 2.21875C11.3949 2.21875 10.7521 2.30277 10.2276 2.49866L10.7524 3.90384C11.0579 3.78973 11.5101 3.71875 12 3.71875C12.4899 3.71875 12.9421 3.78973 13.2476 3.90384L13.7724 2.49866ZM10.2256 2.49941L5.23558 4.37941L5.76442 5.78309L10.7544 3.90309L10.2256 2.49941ZM5.23733 4.37875C4.49043 4.65803 3.85398 5.2186 3.40741 5.86265C2.96095 6.50656 2.66 7.2978 2.66 8.09125H4.16C4.16 7.6647 4.32906 7.16594 4.64009 6.71735C4.95103 6.2689 5.35957 5.93447 5.76268 5.78375L5.23733 4.37875ZM2.66 8.09125V15.5212H4.16V8.09125H2.66ZM2.66 15.5212C2.66 16.2602 2.8989 17.059 3.24874 17.7545C3.59871 18.4503 4.09802 19.1188 4.69102 19.562L5.58899 18.3605C5.23198 18.0937 4.86629 17.6322 4.58877 17.0805C4.31111 16.5285 4.16 15.9623 4.16 15.5212H2.66ZM4.69135 19.5623L8.99135 22.7723L9.88866 21.5702L5.58866 18.3602L4.69135 19.5623ZM8.98932 22.7707C9.84721 23.4157 10.9462 23.7163 12.01 23.7163C13.0738 23.7163 14.1728 23.4157 15.0307 22.7707L14.1293 21.5718C13.5772 21.9868 12.8112 22.2163 12.01 22.2163C11.2088 22.2163 10.4428 21.9868 9.89068 21.5718L8.98932 22.7707ZM15.0287 22.7723L19.3287 19.5623L18.4313 18.3602L14.1313 21.5702L15.0287 22.7723ZM19.329 19.562C19.922 19.1188 20.4213 18.4503 20.7713 17.7545C21.1211 17.059 21.36 16.2602 21.36 15.5212H19.86C19.86 15.9623 19.7089 16.5285 19.4312 17.0805C19.1537 17.6322 18.788 18.0937 18.431 18.3605L19.329 19.562ZM21.36 15.5212V8.09125H19.86V15.5212H21.36Z' fill='%239D9DAE'/%3e%3c/svg%3e" alt="Tick Icon" />\n        </div>\n\n        <p\n          class="pera-wallet-connect-modal-information-section__features-item__description">\n          Your private keys are safely stored locally\n        </p>\n      </li>\n\n      <li class="pera-wallet-connect-modal-information-section__features-item">\n        <div\n          class="pera-wallet-connect-modal-information-section__features-item__icon-wrapper">\n          <img src="data:image/svg+xml,%3csvg width='20' height='21' viewBox='0 0 20 21' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M18.05 9.67014L17.3198 9.49894L18.05 9.67014ZM17.2333 13.1535L16.5031 12.9823L16.5029 12.9835L17.2333 13.1535ZM12.55 17.1285L12.6218 16.3818L12.6098 16.3809L12.55 17.1285ZM11.2 16.9035L11.376 16.1744L11.3737 16.1739L11.2 16.9035ZM9.8 16.5701L9.97372 15.8405L9.97324 15.8404L9.8 16.5701ZM6.06667 10.5451L6.79687 10.7163L6.79696 10.7159L6.06667 10.5451ZM6.88334 7.05347L6.15327 6.88169L6.15304 6.88267L6.88334 7.05347ZM7.5 5.22014L8.17303 5.55114L8.17523 5.54659L7.5 5.22014ZM12.9167 3.32014L12.744 4.05L12.7461 4.05049L12.9167 3.32014ZM14.3083 3.64514L14.4791 2.91485L14.4789 2.91479L14.3083 3.64514ZM10.5917 18.0285L10.359 17.3155L10.3572 17.3161L10.5917 18.0285ZM9.27501 18.4618L9.50516 19.1756L9.50947 19.1742L9.27501 18.4618ZM3.15001 15.3285L2.43654 15.5597L2.43672 15.5603L3.15001 15.3285ZM2.08334 12.0368L1.36953 12.267L1.36987 12.268L2.08334 12.0368ZM5.20834 5.91182L5.43849 6.62565L5.44281 6.62423L5.20834 5.91182ZM6.52501 5.47848L6.29831 4.76352L6.29055 4.76608L6.52501 5.47848ZM10.7177 7.35149C10.3162 7.24967 9.90818 7.49261 9.80635 7.89411C9.70453 8.29561 9.94746 8.70364 10.349 8.80546L10.7177 7.35149ZM14.3906 9.83046C14.7921 9.93229 15.2002 9.68935 15.302 9.28785C15.4038 8.88635 15.1609 8.47832 14.7594 8.37649L14.3906 9.83046ZM9.90211 10.5768C9.50076 10.4743 9.09238 10.7167 8.98996 11.118C8.88755 11.5194 9.12988 11.9278 9.53124 12.0302L9.90211 10.5768ZM11.9479 12.6469C12.3493 12.7493 12.7576 12.5069 12.8601 12.1056C12.9625 11.7042 12.7201 11.2958 12.3188 11.1934L11.9479 12.6469ZM17.3198 9.49894L16.5031 12.9823L17.9635 13.3247L18.7802 9.84133L17.3198 9.49894ZM16.5029 12.9835C16.168 14.4224 15.6979 15.2955 15.1165 15.793C14.5605 16.2688 13.7912 16.4944 12.6218 16.3819L12.4782 17.875C13.9088 18.0126 15.1312 17.7548 16.0918 16.9327C17.0271 16.1323 17.5986 14.8928 17.9638 13.3234L16.5029 12.9835ZM12.6098 16.3809C12.2388 16.3512 11.8281 16.2835 11.376 16.1744L11.024 17.6325C11.5386 17.7567 12.0279 17.8391 12.4902 17.8761L12.6098 16.3809ZM11.3737 16.1739L9.97372 15.8405L9.62629 17.2997L11.0263 17.6331L11.3737 16.1739ZM9.97324 15.8404C8.30732 15.4449 7.40652 14.876 6.96107 14.1588C6.51616 13.4425 6.40566 12.385 6.79687 10.7163L5.33647 10.3739C4.91101 12.1887 4.92968 13.7311 5.68685 14.9502C6.44349 16.1685 7.81769 16.8704 9.62676 17.2999L9.97324 15.8404ZM6.79696 10.7159L7.61363 7.22428L6.15304 6.88267L5.33638 10.3743L6.79696 10.7159ZM7.6134 7.22525C7.77277 6.54795 7.95691 5.99053 8.17301 5.55113L6.82699 4.88915C6.54309 5.46641 6.32724 6.14234 6.15327 6.88169L7.6134 7.22525ZM8.17523 5.54659C8.59604 4.67619 9.11898 4.20234 9.77488 3.97598C10.4657 3.73759 11.4133 3.73525 12.744 4.05L13.0893 2.59028C11.6367 2.2467 10.3635 2.18603 9.28554 2.55805C8.17269 2.94211 7.37896 3.74743 6.82478 4.89369L8.17523 5.54659ZM12.7461 4.05049L14.1378 4.37549L14.4789 2.91479L13.0872 2.58979L12.7461 4.05049ZM14.1375 4.37543C15.8111 4.76687 16.7126 5.33603 17.1575 6.05304C17.6023 6.77006 17.7112 7.82942 17.3198 9.49894L18.7802 9.84133C19.2054 8.02753 19.1893 6.48272 18.4321 5.26224C17.6749 4.04175 16.2972 3.34008 14.4791 2.91485L14.1375 4.37543ZM12.1294 16.5075C11.6911 16.8045 11.1123 17.0697 10.359 17.3155L10.8243 18.7415C11.6544 18.4706 12.3756 18.1525 12.9706 17.7494L12.1294 16.5075ZM10.3572 17.3161L9.04055 17.7494L9.50947 19.1742L10.8261 18.7409L10.3572 17.3161ZM9.04486 17.748C7.46037 18.2589 6.43607 18.2362 5.71663 17.8681C4.99693 17.4999 4.37829 16.6816 3.8633 15.0967L2.43672 15.5603C2.99673 17.2837 3.78642 18.5654 5.03339 19.2035C6.28062 19.8416 7.78131 19.7314 9.50516 19.1756L9.04486 17.748ZM3.86348 15.0973L2.79682 11.8056L1.36987 12.268L2.43654 15.5597L3.86348 15.0973ZM2.79716 11.8067C2.28607 10.2215 2.3068 9.19457 2.67362 8.4739C3.03983 7.75443 3.85506 7.13616 5.43849 6.62563L4.9782 5.198C3.25329 5.75414 1.97269 6.54421 1.33682 7.79348C0.701551 9.04157 0.813948 10.5438 1.36953 12.267L2.79716 11.8067ZM5.44281 6.62423L6.75947 6.19089L6.29055 4.76608L4.97388 5.19941L5.44281 6.62423ZM6.75169 6.19341C7.08205 6.08866 7.37424 6.00724 7.63942 5.95707L7.36058 4.48321C7.00909 4.54971 6.6513 4.65164 6.29833 4.76356L6.75169 6.19341ZM10.349 8.80546L14.3906 9.83046L14.7594 8.37649L10.7177 7.35149L10.349 8.80546ZM9.53124 12.0302L11.9479 12.6469L12.3188 11.1934L9.90211 10.5768L9.53124 12.0302Z' fill='%239D9DAE'/%3e%3c/svg%3e" alt="Note Icon" />\n        </div>\n\n        <p\n          class="pera-wallet-connect-modal-information-section__features-item__description">\n          View NFTs, buy and swap crypto and more\n        </p>\n      </li>\n    </ul>\n  </section>\n`;class D extends HTMLElement{constructor(){var n,t,a,o;super(),this.attachShadow({mode:"open"});const l="true"===(null===(n=document.querySelector("pera-wallet-connect-modal"))||void 0===n?void 0:n.getAttribute("compact-mode"));if(this.shadowRoot&&(!l&&!de()||de())){const n=document.createElement("style");n.textContent=j,this.shadowRoot.append(T.content.cloneNode(true),n),de()?null===(t=this.shadowRoot.getElementById("pera-wallet-connect-modal-information-section-title"))||void 0===t||t.setAttribute("style","display: none;"):(null===(a=this.shadowRoot.getElementById("pera-wallet-connect-modal-information-section-pera-icon"))||void 0===a||a.setAttribute("src","data:image/svg+xml,%3csvg width='84' height='38' viewBox='0 0 84 38' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M19.806 8.62773C20.4416 11.2609 20.2268 13.5772 19.3262 13.8012C18.4256 14.0253 17.1803 12.0723 16.5448 9.43906C15.9092 6.80585 16.1241 4.48959 17.0246 4.26555C17.9252 4.04151 19.1705 5.99452 19.806 8.62773Z' fill='%233C3C49'/%3e%3cpath d='M30.3007 10.8917C28.8932 9.3999 26.0929 9.80424 24.0461 11.7948C21.9994 13.7853 21.4812 16.6082 22.8887 18.1C24.2962 19.5917 27.0964 19.1874 29.1432 17.1969C31.1899 15.2064 31.7082 12.3834 30.3007 10.8917Z' fill='%233C3C49'/%3e%3cpath d='M19.1061 33.734C20.0067 33.5099 20.1899 31.0627 19.5153 28.2678C18.8408 25.473 17.5639 23.3889 16.6633 23.613C15.7627 23.837 15.5795 26.2843 16.2541 29.0791C16.9286 31.874 18.2056 33.958 19.1061 33.734Z' fill='%233C3C49'/%3e%3cpath d='M9.92571 12.2574C12.5239 13.0236 14.4224 14.3678 14.1662 15.2597C13.9099 16.1517 11.5959 16.2536 8.99771 15.4874C6.3995 14.7212 4.50098 13.377 4.75724 12.4851C5.0135 11.5931 7.3275 11.4912 9.92571 12.2574Z' fill='%233C3C49'/%3e%3cpath d='M26.7892 22.3292C29.5469 23.1424 31.5747 24.5247 31.3184 25.4167C31.0621 26.3086 28.6189 26.3724 25.8612 25.5592C23.1035 24.7459 21.0757 23.3636 21.3319 22.4717C21.5882 21.5797 24.0315 21.5159 26.7892 22.3292Z' fill='%233C3C49'/%3e%3cpath d='M12.8493 20.4577C12.205 19.7898 10.0916 20.7619 8.12896 22.6289C6.16631 24.4959 5.09759 26.5509 5.7419 27.2188C6.38622 27.8867 8.49958 26.9146 10.4622 25.0476C12.4249 23.1806 13.4936 21.1256 12.8493 20.4577Z' fill='%233C3C49'/%3e%3cpath d='M41.691 12.5347V11.9635H39.3366V27.1957H41.691V23.0915C41.691 22.6472 41.691 22.2876 41.6482 21.801H41.691C42.5471 23.1973 44.0026 23.9377 45.7148 23.9377C48.6043 23.9377 51.1299 21.7587 51.1299 17.7179C51.1299 13.7617 48.6043 11.625 45.7148 11.625C44.0668 11.625 42.6113 12.3443 41.691 13.7617H41.6482C41.691 13.2963 41.691 12.9578 41.691 12.5347ZM45.1155 21.9279C42.9324 21.9068 41.6696 20.0662 41.6696 17.6967C41.6696 15.4542 42.9324 13.656 45.1155 13.6348C47.2559 13.6137 48.6685 15.2638 48.6685 17.7179C48.6685 20.2354 47.2559 21.9491 45.1155 21.9279Z' fill='%233C3C49'/%3e%3cpath d='M63.4932 16.7236C63.4932 13.8041 61.1388 11.625 57.9283 11.625C54.5037 11.625 52.1279 13.931 52.1279 17.7814C52.1279 21.4836 54.4609 23.9377 57.9283 23.9377C60.7749 23.9377 62.8939 22.2876 63.3862 20.0239H60.8177C60.4111 21.1663 59.2981 21.9279 57.9283 21.9279C56.1732 21.9279 54.889 20.6797 54.6107 18.6064H63.4932V16.7236ZM57.9283 13.6348C59.662 13.6348 60.8606 14.8195 61.1174 16.5332H54.6321C54.9318 14.883 56.1518 13.6348 57.9283 13.6348Z' fill='%233C3C49'/%3e%3cpath d='M65.224 23.5992H67.5784V17.0409C67.5784 14.7984 68.8198 13.6348 70.7462 13.6348H72.009V11.625H71.003C69.2693 11.625 68.1991 12.7674 67.5784 13.7617H67.5356V11.9635H65.224V23.5992Z' fill='%233C3C49'/%3e%3cpath d='M83.0154 21.5683C82.6944 21.5683 82.5445 21.3779 82.5445 20.9971V15.8773C82.5445 13.4233 81.3459 11.625 77.8144 11.625C74.3898 11.625 72.8273 13.3175 72.6561 15.7292H75.0105C75.1603 14.4176 76.2091 13.6348 77.8144 13.6348C79.1842 13.6348 80.1259 14.2272 80.1259 15.158C80.1259 15.9196 79.5909 16.3851 77.8358 16.3851H76.894C74.0901 16.3851 72.2066 17.5063 72.2066 20.0662C72.2066 22.753 74.1972 23.98 76.5301 23.98C78.2638 23.98 79.7407 23.2184 80.3186 21.5894C80.3828 22.7742 81.1747 23.5992 82.673 23.5992H84V21.5683H83.0154ZM80.1902 18.1833C80.1902 20.8067 78.7561 21.9491 76.9154 21.9491C75.3101 21.9491 74.668 21.0182 74.668 20.0662C74.668 19.1565 75.2245 18.416 76.9368 18.416H77.2793C78.9273 18.416 79.9547 17.8448 80.1688 16.8505H80.1902V18.1833Z' fill='%233C3C49'/%3e%3c/svg%3e"),null===(o=this.shadowRoot.getElementById("pera-wallet-connect-modal-information-section-connect-pera-mobile"))||void 0===o||o.setAttribute("style","display: none;"));}}}var O='@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");\n.pera-wallet-modal {\n  --pera-wallet-modal-font-family: "Inter", sans-serif;\n  --pera-wallet-modal-compact-width: 380px;\n  --pera-wallet-modal-compact-height: 396px;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  position: fixed;\n  top: 0;\n  right: 0;\n  left: 0;\n  bottom: 0;\n  z-index: 999999;\n  width: 100vw;\n  height: 100vh;\n  background-color: rgba(0, 0, 0, 0.7);\n}\n.pera-wallet-modal--select-account .pera-wallet-modal__body {\n  width: 480px;\n  height: 578px;\n  background-color: #ffffff;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body {\n  position: absolute;\n  top: unset;\n  bottom: 0;\n  left: 0;\n  width: 100%;\n  max-width: unset;\n  padding: 20px;\n  background-color: #ffffff;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);\n  border-radius: 20px 20px 0px 0px;\n  animation: 0.3s PeraWalletConnectMobileSlideIn ease-out;\n  overflow-y: auto;\n  transform: unset;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body::before {\n  background-image: unset;\n}\n.pera-wallet-modal--compact:not(.pera-wallet-modal--mobile) .pera-wallet-modal__body {\n  width: var(--pera-wallet-modal-compact-width);\n  height: var(--pera-wallet-modal-compact-height);\n  padding: 0;\n}\n.pera-wallet-modal * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.pera-wallet-modal ul,\n.pera-wallet-modal ol,\n.pera-wallet-modal li {\n  list-style-type: none;\n}\n\n.pera-wallet-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  height: 48px;\n  padding: 14px;\n  border: none;\n  border-radius: 12px;\n  outline: none;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 14px;\n}\n\n.pera-wallet-modal__logo img {\n  display: block;\n  width: 32px;\n}\n\n.pera-wallet-modal__body {\n  position: relative;\n  top: 50%;\n  left: 50%;\n  width: 700px;\n  max-width: calc(100vw - 80px);\n  padding: 28px;\n  background-color: #f3f3f7;\n  box-shadow: 1px 2px 2px rgba(0, 0, 0, 0.08);\n  border-radius: 24px;\n  animation: 0.3s PeraWalletConnectSlideIn ease-out;\n  transform: translate(-50%, -50%);\n}\n.pera-wallet-modal__body::before {\n  --background-line: #1e0972 0 1.2px, transparent 0 calc(100% - 1.2px), #1e0972;\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  z-index: -1;\n  content: "";\n  background-image: linear-gradient(var(--background-line)), linear-gradient(90deg, var(--background-line));\n  background-size: 116px 116px;\n  mix-blend-mode: overlay;\n  border-radius: 24px;\n  opacity: 0.8;\n  pointer-events: none;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-modal--desktop .pera-wallet-modal__body {\n    width: 100%;\n    max-width: calc(100vw - 32px);\n    padding: 24px;\n  }\n}\n@keyframes PeraWalletConnectSlideIn {\n  0% {\n    opacity: 0;\n    transform: translate(-50%, calc(-50% + 24px));\n  }\n  100% {\n    opacity: 1;\n    transform: translate(-50%, -50%);\n  }\n}\n@keyframes PeraWalletConnectMobileSlideIn {\n  0% {\n    bottom: -30%;\n    opacity: 0;\n  }\n  100% {\n    bottom: 0;\n    opacity: 1;\n  }\n}\n.pera-wallet-connect-modal-pending-message-section {\n  display: grid;\n  grid-template-columns: 1fr;\n  grid-template-rows: auto 48px;\n  gap: 56px;\n  height: 100%;\n  padding: 4px;\n  padding-bottom: 70px;\n}\n\n.pera-wallet-connect-modal-pending-message {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-direction: column;\n  text-align: center;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view {\n  display: flex;\n  justify-content: space-between;\n  flex-direction: column;\n  height: 100%;\n  margin-top: 10px;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__title {\n  margin: 16px 0 12px;\n  color: #3c3c49;\n  font-size: 18px;\n  font-weight: 500;\n  line-height: 24px;\n  letter-spacing: -0.26px;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__description {\n  color: #6a6a81;\n  font-size: 14px;\n  font-weight: 400;\n  line-height: 24px;\n  letter-spacing: -0.01px;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__button {\n  display: block;\n  width: 100%;\n  padding: 14px;\n  border-radius: 12px;\n  text-decoration: none;\n  text-align: center;\n  font-size: 14px;\n  line-height: 20px;\n  letter-spacing: -0.09px;\n  font-weight: 500;\n  color: #ffffff;\n  background-color: #6b46fe;\n  border: none;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor {\n  display: flex;\n  gap: 12px;\n  margin-bottom: 20px;\n  padding: 16px;\n  background: #ffffff;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n  border-radius: 12px;\n  text-decoration: none;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__image {\n  width: 24px;\n  height: 24px;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__title-wrapper {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 4px;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n  letter-spacing: -0.1px;\n  color: #3c3c49;\n}\n.pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__description {\n  /* stylelint-disable value-no-vendor-prefix */\n  /* stylelint-disable  property-no-vendor-prefix */\n  display: -webkit-box;\n  max-width: 100%;\n  -webkit-line-clamp: 2;\n  /* autoprefixer: ignore next */\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  /* stylelint-enable value-no-vendor-prefix */\n  /* stylelint-enable property-no-vendor-prefix */\n  margin: 0;\n  font-size: 12px;\n  font-weight: 400;\n  line-height: 18px;\n  letter-spacing: 0.01px;\n  color: #9d9dae;\n}\n\n.pera-wallet-connect-modal-pending-message__animation-wrapper {\n  width: 56px;\n  height: 56px;\n  background-color: #6b46fe;\n  border-radius: 50%;\n}\n\n.pera-wallet-connect-modal-pending-message__text {\n  max-width: 271px;\n  margin-top: 24px;\n  color: #3c3c49;\n  font-size: 18px;\n  font-weight: 500;\n  line-height: 28px;\n  letter-spacing: -0.26px;\n}\n\n.pera-wallet-connect-modal-pending-message__cancel-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  padding: 14px;\n  color: #6a6a81;\n  background-color: #ffffff;\n  box-shadow: 0px 0px 1px rgba(12, 26, 75, 0.24), 0px 3px 8px -1px rgba(50, 50, 71, 0.05);\n  border-radius: 12px;\n  text-decoration: none;\n  text-align: center;\n  font-size: 14px;\n  line-height: 20px;\n  letter-spacing: -0.09px;\n  font-weight: 500;\n  border: none;\n}';w(O);const q=document.createElement("template");q.innerHTML='\n  <div class="pera-wallet-connect-modal-pending-message-section">\n    <div class="pera-wallet-connect-modal-pending-message">\n      <div id="pera-wallet-connect-modal-pending-message-animation-wrapper" class="pera-wallet-connect-modal-pending-message__animation-wrapper"></div>\n\n      <div class="pera-wallet-connect-modal-pending-message__text">\n        Please wait while we connect you to Pera Wallet\n      </div>\n    </div>\n\n    <button\n      id="pera-wallet-connect-modal-pending-message-cancel-button"\n      class="pera-wallet-button pera-wallet-connect-modal-pending-message__cancel-button">\n        Cancel\n    </button>\n  </div>\n\n  <div id="pera-wallet-connect-modal-pending-message-audio-wrapper"></div>\n';const U=`\n  <div class="pera-wallet-connect-modal-pending-message--try-again-view">\n    <div>\n      <img src="${P}" alt="Pera Wallet Logo" />\n\n      <h1 class="pera-wallet-connect-modal-pending-message--try-again-view__title">\n        Couldn’t establish connection\n      </h1>\n\n      <p class="pera-wallet-connect-modal-pending-message--try-again-view__description">\n        Having issues? Before trying again, make sure to read the support article below and apply the possible solutions.\n      </p>\n    </div>\n\n    <div>\n      <a\n        href="https://support.perawallet.app/en/article/resolving-walletconnect-issues-1tolptm/"\n        target="_blank"\n        rel="noopener noreferrer"\n        class="pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor">\n        <img\n          class="pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__image"\n          src="data:image/svg+xml,%3csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M8 22.3199C7.72 22.3199 7.42998 22.2499 7.16998 22.1099C6.59998 21.8099 6.25 21.2099 6.25 20.5699V19.15C3.23 18.84 1.25 16.6199 1.25 13.4399V7.43994C1.25 3.99994 3.56 1.68994 7 1.68994H17C20.44 1.68994 22.75 3.99994 22.75 7.43994V13.4399C22.75 16.8799 20.44 19.1899 17 19.1899H13.23L8.96997 22.03C8.67997 22.22 8.34 22.3199 8 22.3199ZM7 3.17993C4.42 3.17993 2.75 4.84993 2.75 7.42993V13.43C2.75 16.01 4.42 17.68 7 17.68C7.41 17.68 7.75 18.02 7.75 18.43V20.56C7.75 20.69 7.83 20.75 7.88 20.78C7.93001 20.81 8.03001 20.84 8.14001 20.77L12.59 17.81C12.71 17.73 12.86 17.68 13.01 17.68H17.01C19.59 17.68 21.26 16.01 21.26 13.43V7.42993C21.26 4.84993 19.59 3.17993 17.01 3.17993H7ZM11.9998 12.11C11.5898 12.11 11.2498 11.77 11.2498 11.36V11.15C11.2498 10.0038 12.0798 9.4336 12.4082 9.20798L12.4198 9.20001C12.7898 8.95001 12.9098 8.78002 12.9098 8.52002C12.9098 8.02002 12.4998 7.60999 11.9998 7.60999C11.4998 7.60999 11.0898 8.02002 11.0898 8.52002C11.0898 8.93002 10.7498 9.27002 10.3398 9.27002C9.92984 9.27002 9.58984 8.93002 9.58984 8.52002C9.58984 7.19002 10.6698 6.10999 11.9998 6.10999C13.3298 6.10999 14.4098 7.19002 14.4098 8.52002C14.4098 9.66002 13.5698 10.23 13.2598 10.44C12.8698 10.7 12.7498 10.87 12.7498 11.15V11.36C12.7498 11.78 12.4098 12.11 11.9998 12.11ZM11.25 13.85C11.25 14.26 11.58 14.6 12 14.6C12.42 14.6 12.75 14.26 12.75 13.85C12.75 13.44 12.41 13.1 12 13.1C11.59 13.1 11.25 13.44 11.25 13.85Z' fill='%236B46FE'/%3e%3c/svg%3e"\n          alt="Help Icon"\n        />\n\n        <div>\n          <div\n            class="pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__title-wrapper">\n            <h1\n              class="pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__title">\n                Resolving WalletConnect issues\n            </h1>\n\n            <img src="data:image/svg+xml,%3csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.3287 10.0983C10.9574 10.0983 10.6564 9.79734 10.6564 9.42604L10.6564 6.29525L5.14866 11.803C4.88611 12.0655 4.46044 12.0655 4.19789 11.803C3.93534 11.5404 3.93534 11.1147 4.19789 10.8522L9.70561 5.34447L6.57482 5.34447C6.20352 5.34447 5.90252 5.04347 5.90252 4.67218C5.90252 4.30088 6.20352 3.99988 6.57482 3.99988L11.3287 3.99988C11.507 3.99988 11.678 4.07071 11.8041 4.19679C11.9301 4.32287 12.001 4.49387 12.001 4.67218L12.001 9.42604C12.001 9.79734 11.7 10.0983 11.3287 10.0983Z' fill='%239D9DAE'/%3e%3c/svg%3e" alt="Send Icon"/>\n          </div>\n\n          <p\n            class="pera-wallet-connect-modal-pending-message--try-again-view__resolving-anchor__description">\n            Unfortunately there are several known issues related to WalletConnect that our team is working on. Some of these issues are related to the WalletConnect JavaScript implementation on the dApp ...\n          </p>\n        </div>\n      </a>\n\n      <button id="pera-wallet-connect-modal-pending-message-try-again-button" class="pera-wallet-connect-button pera-wallet-connect-modal-pending-message--try-again-view__button">\n        Close & Try Again\n      </button>\n    </div>\n  </div>\n  `;class G extends HTMLElement{constructor(){if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const e=document.createElement("style");e.textContent=O,this.shadowRoot.append(q.content.cloneNode(true),e);}}connectedCallback(){var e;const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-pending-message-cancel-button");null==n||n.addEventListener("click",(()=>{this.onClose();})),this.addAudioForConnection(),this.renderLottieAnimation(),setTimeout((()=>{var e;if(q.innerHTML=U,this.shadowRoot){const n=document.createElement("style");n.textContent=O,this.shadowRoot.innerHTML="",this.shadowRoot.append(q.content.cloneNode(true),n);const t=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-pending-message-try-again-button");null==t||t.addEventListener("click",(()=>{this.onClose();}));}}),3e4);}onClose(){Ne(be);}addAudioForConnection(){var e;if("true"===this.getAttribute("should-use-sound")&&he()){const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-pending-message-audio-wrapper"),t=document.createElement("audio");t.src="https://s3.amazonaws.com/wc.perawallet.app/audio.mp3",t.autoplay=true,t.loop=true,null==n||n.appendChild(t);}}renderLottieAnimation(){var e;const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-connect-modal-pending-message-animation-wrapper");n&&m.loadAnimation({container:n,renderer:"svg",loop:true,autoplay:true,path:"https://s3.amazonaws.com/wc.perawallet.app/static/pera-loader-animation.json"});}}var N='.pera-wallet-sign-txn-toast {\n  --pera-wallet-sign-txn-toast-width: 422px;\n  --pera-wallet-sign-txn-toast-height: 134px;\n  --pera-wallet-sign-txn-toast-font-family: "Inter", sans-serif;\n  position: fixed;\n  bottom: 28px;\n  right: 35px;\n  z-index: 11;\n  overflow: hidden;\n  width: var(--pera-wallet-sign-txn-toast-width);\n  height: var(--pera-wallet-sign-txn-toast-height);\n  background: #edeffb;\n  border-radius: 8px;\n  animation: 0.2s PeraWalletSignTxnToastSlideIn ease-out;\n}\n.pera-wallet-sign-txn-toast * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-sign-txn-toast-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.pera-wallet-sign-txn-toast ul,\n.pera-wallet-sign-txn-toast ol,\n.pera-wallet-sign-txn-toast li {\n  list-style-type: none;\n}\n\n.pera-wallet-sign-txn-toast__header__close-button {\n  position: absolute;\n  top: 10px;\n  right: 10px;\n  width: 20px;\n  height: 20px;\n  margin: 0;\n  padding: 0;\n  background: transparent;\n  border: none;\n  cursor: pointer;\n}\n\n.pera-wallet-sign-txn-toast__content__lottie-animation {\n  position: absolute;\n  top: -75px;\n  left: -100px;\n  width: 368px;\n  height: 368px;\n}\n\n.pera-wallet-sign-txn-toast__content__description {\n  position: absolute;\n  top: 40px;\n  right: 48px;\n  max-width: 197px;\n  color: #3c3c49;\n  font-size: 14px;\n  line-height: 22px;\n  letter-spacing: -0.1px;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-sign-txn-toast {\n    display: none;\n  }\n}\n@keyframes PeraWalletSignTxnToastSlideIn {\n  0% {\n    bottom: 12px;\n    opacity: 0;\n  }\n  100% {\n    bottom: 26px;\n    opacity: 1;\n  }\n}';w(N);const Q=document.createElement("template");Q.innerHTML='\n  <div class="pera-wallet-sign-txn-toast">\n    <div class="pera-wallet-sign-txn-toast__header">\n      <button\n        id="pera-wallet-sign-txn-toast-close-button"\n        class="pera-wallet-sign-txn-toast__header__close-button">\n        <img src="data:image/svg+xml,%3csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3e%3cpath d=\'M14.4107 4.41074L9.41074 9.41074L10.5893 10.5893L15.5893 5.58926L14.4107 4.41074ZM9.41074 9.41074L4.41074 14.4107L5.58926 15.5893L10.5893 10.5893L9.41074 9.41074ZM15.5893 14.4107L10.5893 9.41074L9.41074 10.5893L14.4107 15.5893L15.5893 14.4107ZM10.5893 9.41074L5.58926 4.41074L4.41074 5.58926L9.41074 10.5893L10.5893 9.41074Z\' fill=\'%239099BD\'/%3e%3c/svg%3e" />\n      </button>\n    </div>\n    <div class="pera-wallet-sign-txn-toast__content">\n      <div id="pera-wallet-sign-txn-toast-lottie-animation" style="width:368;height:368" class="pera-wallet-sign-txn-toast__content__lottie-animation"></div>\n      <p class="pera-wallet-sign-txn-toast__content__description">\n        Please launch <b>Pera Wallet</b> on your iOS or Android device to sign this transaction.\n      </p>\n    </div>\n  </div>\n';class J extends HTMLElement{constructor(){if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const e=document.createElement("style");e.textContent=N,this.shadowRoot.append(Q.content.cloneNode(true),e);const n=this.shadowRoot.getElementById("pera-wallet-sign-txn-toast-close-button");null==n||n.addEventListener("click",(()=>{Ne(Ee);})),this.renderLottieAnimation();}}renderLottieAnimation(){var e;const n=null===(e=this.shadowRoot)||void 0===e?void 0:e.getElementById("pera-wallet-sign-txn-toast-lottie-animation");n&&m.loadAnimation({container:n,renderer:"svg",loop:true,autoplay:true,path:"https://s3.amazonaws.com/wc.perawallet.app/static/sign-toast-animation.json"});}}var K='@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");\n.pera-wallet-modal {\n  --pera-wallet-modal-font-family: "Inter", sans-serif;\n  --pera-wallet-modal-compact-width: 380px;\n  --pera-wallet-modal-compact-height: 396px;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  position: fixed;\n  top: 0;\n  right: 0;\n  left: 0;\n  bottom: 0;\n  z-index: 999999;\n  width: 100vw;\n  height: 100vh;\n  background-color: rgba(0, 0, 0, 0.7);\n}\n.pera-wallet-modal--select-account .pera-wallet-modal__body {\n  width: 480px;\n  height: 578px;\n  background-color: #ffffff;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body {\n  position: absolute;\n  top: unset;\n  bottom: 0;\n  left: 0;\n  width: 100%;\n  max-width: unset;\n  padding: 20px;\n  background-color: #ffffff;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);\n  border-radius: 20px 20px 0px 0px;\n  animation: 0.3s PeraWalletConnectMobileSlideIn ease-out;\n  overflow-y: auto;\n  transform: unset;\n}\n.pera-wallet-modal--mobile .pera-wallet-modal__body::before {\n  background-image: unset;\n}\n.pera-wallet-modal--compact:not(.pera-wallet-modal--mobile) .pera-wallet-modal__body {\n  width: var(--pera-wallet-modal-compact-width);\n  height: var(--pera-wallet-modal-compact-height);\n  padding: 0;\n}\n.pera-wallet-modal * {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-smooth: antialiased;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n.pera-wallet-modal ul,\n.pera-wallet-modal ol,\n.pera-wallet-modal li {\n  list-style-type: none;\n}\n\n.pera-wallet-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: auto;\n  height: 48px;\n  padding: 14px;\n  border: none;\n  border-radius: 12px;\n  outline: none;\n  cursor: pointer;\n  font-family: var(--pera-wallet-modal-font-family);\n  font-size: 14px;\n}\n\n.pera-wallet-modal__logo img {\n  display: block;\n  width: 32px;\n}\n\n.pera-wallet-modal__body {\n  position: relative;\n  top: 50%;\n  left: 50%;\n  width: 700px;\n  max-width: calc(100vw - 80px);\n  padding: 28px;\n  background-color: #f3f3f7;\n  box-shadow: 1px 2px 2px rgba(0, 0, 0, 0.08);\n  border-radius: 24px;\n  animation: 0.3s PeraWalletConnectSlideIn ease-out;\n  transform: translate(-50%, -50%);\n}\n.pera-wallet-modal__body::before {\n  --background-line: #1e0972 0 1.2px, transparent 0 calc(100% - 1.2px), #1e0972;\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  z-index: -1;\n  content: "";\n  background-image: linear-gradient(var(--background-line)), linear-gradient(90deg, var(--background-line));\n  background-size: 116px 116px;\n  mix-blend-mode: overlay;\n  border-radius: 24px;\n  opacity: 0.8;\n  pointer-events: none;\n}\n\n@media (max-width: 767px) {\n  .pera-wallet-modal--desktop .pera-wallet-modal__body {\n    width: 100%;\n    max-width: calc(100vw - 32px);\n    padding: 24px;\n  }\n}\n@keyframes PeraWalletConnectSlideIn {\n  0% {\n    opacity: 0;\n    transform: translate(-50%, calc(-50% + 24px));\n  }\n  100% {\n    opacity: 1;\n    transform: translate(-50%, -50%);\n  }\n}\n@keyframes PeraWalletConnectMobileSlideIn {\n  0% {\n    bottom: -30%;\n    opacity: 0;\n  }\n  100% {\n    bottom: 0;\n    opacity: 1;\n  }\n}\n.pera-wallet-sign-txn-modal.pera-wallet-modal .pera-wallet-modal__body {\n  width: 480px;\n  height: 578px;\n  background-color: #ffffff;\n  background-image: unset;\n  padding: 0;\n}\n.pera-wallet-sign-txn-modal.pera-wallet-modal .pera-wallet-modal__body .pera-wallet-sign-txn-modal__body__content {\n  width: 100%;\n  height: 100%;\n}\n.pera-wallet-sign-txn-modal.pera-wallet-modal .pera-wallet-modal__body #pera-wallet-iframe {\n  width: 100%;\n  height: 100%;\n  border-radius: 16px;\n  margin: 0 auto;\n  border: none;\n}\n\n.pera-wallet-sign-txn-modal--compact.pera-wallet-modal .pera-wallet-modal__body {\n  width: var(--pera-wallet-modal-compact-width);\n  height: var(--pera-wallet-modal-compact-height);\n}';w(K);const Y=document.createElement("template");Y.innerHTML=`\n  <div id="pera-wallet-sign-txn-modal" class="${Re} pera-wallet-sign-txn-modal">\n    <div class="pera-wallet-modal__body">\n      <pera-wallet-modal-header modal-id="${Te}"></pera-wallet-modal-header/>\n\n      <div class="pera-wallet-sign-txn-modal__body__content" />\n    </div>\n  </div>\n`;class X extends HTMLElement{constructor(){if(super(),this.attachShadow({mode:"open"}),this.shadowRoot){const e=document.createElement("style");e.textContent=K,this.shadowRoot.append(Y.content.cloneNode(true),e);if("true"===this.getAttribute("compact-mode")){const e=this.shadowRoot.getElementById("pera-wallet-sign-txn-modal");null==e||e.classList.add("pera-wallet-sign-txn-modal--compact");}}}}function ee(){document.documentElement.style.setProperty("--pera-wallet-vh",.01*window.innerHeight+"px");}function ne(e,n){window.customElements.get(e)||window.customElements.define(e,n);}"complete"===document.readyState||"interactive"===document.readyState?ee():window.addEventListener("DOMContentLoaded",(()=>{ee();})),window.addEventListener("resize",(()=>{ee();})),ne("pera-wallet-connect-modal",R),ne("pera-wallet-modal-desktop-mode",E),ne("pera-wallet-modal-header",f),ne("pera-wallet-modal-touch-screen-mode",B),ne("pera-wallet-redirect-modal",W),ne("pera-wallet-connect-modal-information-section",D),ne("pera-wallet-connect-modal-pending-message-section",G),ne("pera-wallet-sign-txn-toast",J),ne("pera-wallet-sign-txn-modal",X),ne("pera-wallet-download-qr-code",v);
