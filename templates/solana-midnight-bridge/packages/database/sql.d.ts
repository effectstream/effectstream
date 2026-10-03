// Bun imports `.sql` files as text (`import sql from "./x.sql" with { type: "text" }`).
declare module "*.sql" {
  const text: string;
  export default text;
}
