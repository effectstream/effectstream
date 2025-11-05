// import { bound } from "@effectstream/utils";
import { onlyOnce, onlyValue } from "../utils.ts";
import type { SecurityNamespace as NamespaceType } from "../../schema/namespace.ts";

export type PreBuildSecurityNamespaceData<
  SecurityNamespace extends undefined | NamespaceType = undefined,
> = {
  securityNamespace: SecurityNamespace;
};
export type PostBuildSecurityNamespaceData<
  SecurityNamespace extends NamespaceType = NamespaceType,
> = {
  securityNamespace: SecurityNamespace;
};

export class SecurityNamespaceBuilder<
  SecurityNamespace extends undefined | NamespaceType = undefined,
> {
  data: PreBuildSecurityNamespaceData<SecurityNamespace>;

  constructor() {
    this.data = {
      securityNamespace: undefined as SecurityNamespace,
    };
  }

  setSecurityNamespace = onlyOnce({
    key: () => this.data.securityNamespace,
    name: "securityNamespace",
    build: <NewNamespace extends NamespaceType>(
      namespace: NewNamespace,
    ): SecurityNamespaceBuilder<NewNamespace> => {
      (this.data.securityNamespace as any) = namespace;
      return this as any;
    },
  });

  build = onlyValue({
    value: () => this.data,
    target: () => ({}) as PostBuildSecurityNamespaceData,
    name: "securityNamespace",
    build: (): typeof this.data => {
      return this.data as any;
    },
  });
}
