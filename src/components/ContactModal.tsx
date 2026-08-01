import { useApp } from "../store";
import { css } from "../css";

export function ContactModal() {
  const { state, closeContact, sendContact } = useApp();

  return (
    <div onClick={closeContact} style={css("position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.45); backdrop-filter:blur(3px); z-index:80; display:flex; align-items:center; justify-content:center; padding:20px;")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:480px; max-width:100%; background:#fff; border-radius:18px; box-shadow:0 40px 90px -34px oklch(0.2 0.05 260 / 0.7); animation:fadeUp .3s ease both; overflow:hidden;")}>
        {!state.contactSent && (
          <div style={css("padding:26px;")}>
            <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;")}><h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0;")}>Contact us</h2><button onClick={closeContact} style={css("background:none; border:none; font-size:22px; line-height:1; color:oklch(0.55 0.015 260); cursor:pointer;")}>×</button></div>
            <p style={css("font-size:13.5px; color:oklch(0.45 0.015 260); margin:0 0 20px; line-height:1.5;")}>Questions, feedback, or trouble? Our team reads every message — usually back within a few hours.</p>
            <div style={css("display:flex; gap:10px; margin-bottom:20px;")}>
              <div style={css("flex:1; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:13px; text-align:center;")}><div style={css("font-size:19px; margin-bottom:6px;")}>✉️</div><div style={css("font-size:12px; font-weight:600;")}>Email</div><div style={css("font-size:10.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>help@prepfor.me</div></div>
              <div style={css("flex:1; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:13px; text-align:center;")}><div style={css("font-size:19px; margin-bottom:6px;")}>💬</div><div style={css("font-size:12px; font-weight:600;")}>Live chat</div><div style={css("font-size:10.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>Mon–Fri, 9–6 ET</div></div>
              <div style={css("flex:1; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:13px; text-align:center;")}><div style={css("font-size:19px; margin-bottom:6px;")}>📖</div><div style={css("font-size:12px; font-weight:600;")}>Help center</div><div style={css("font-size:10.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>Guides &amp; FAQ</div></div>
            </div>
            <div style={css("display:flex; flex-direction:column; gap:14px;")}>
              <div><div style={css("font-size:12px; font-weight:600; margin-bottom:8px;")}>Topic</div><div style={css("display:flex; gap:7px; flex-wrap:wrap;")}><span style={css("font-size:12px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:6px 12px; border-radius:100px;")}>General</span><span style={css("font-size:12px; border:1px solid oklch(0.9 0.006 260); color:oklch(0.45 0.015 260); padding:6px 12px; border-radius:100px;")}>Billing</span><span style={css("font-size:12px; border:1px solid oklch(0.9 0.006 260); color:oklch(0.45 0.015 260); padding:6px 12px; border-radius:100px;")}>Bug report</span><span style={css("font-size:12px; border:1px solid oklch(0.9 0.006 260); color:oklch(0.45 0.015 260); padding:6px 12px; border-radius:100px;")}>Privacy</span></div></div>
              <div><div style={css("font-size:12px; font-weight:600; margin-bottom:8px;")}>Message</div><div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:13px; background:oklch(0.99 0.003 260); font-size:13.5px; color:oklch(0.55 0.015 260); min-height:88px; line-height:1.5;")}>How can we help?</div></div>
              <button onClick={sendContact} style={css("font-family:'IBM Plex Sans'; font-size:14.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:13px; border-radius:11px; cursor:pointer;")}>Send message</button>
            </div>
          </div>
        )}
        {state.contactSent && (
          <div style={css("padding:46px 30px; text-align:center;")}>
            <div style={css("width:60px; height:60px; border-radius:16px; background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.45 0.13 145); display:flex; align-items:center; justify-content:center; margin:0 auto 18px; font-size:28px;")}>✓</div>
            <h2 style={css("font-family:'Space Grotesk'; font-size:21px; font-weight:600; margin:0 0 8px;")}>Message sent.</h2>
            <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px; line-height:1.5;")}>We'll get back to you at your account email shortly. Thanks for reaching out.</p>
            <button onClick={closeContact} style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:12px 22px; border-radius:10px; cursor:pointer;")}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
