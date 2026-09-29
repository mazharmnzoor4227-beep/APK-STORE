import { Header } from '../../../components/header';
import { LoginForm } from '../../../components/login-form';

export default function AdminLogin() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER ACCESS / SECURE</span><h1>Sign in<span className="green-dot">.</span></h1><p>Sign in with the owner email and password configured for APK STORE.</p><LoginForm /></main></>;
}
