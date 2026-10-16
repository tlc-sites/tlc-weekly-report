import { secondaryButtonClass } from "./ui";

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={secondaryButtonClass}>
        로그아웃
      </button>
    </form>
  );
}
