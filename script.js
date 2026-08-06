const form=document.getElementById("checkForm");

form.addEventListener("submit",async(e)=>{

e.preventDefault();

const enrollment=document
.getElementById("enrollment")
.value
.trim();

const course=document
.getElementById("course")
.value;

const response=await fetch("data/students.json");

const students=await response.json();

const student=students.find(s=>

s.enrollment===enrollment

&&

s.course===course

);

const result=document
.getElementById("result");

if(!student){

result.innerHTML=

"<p style='color:red'>❌ Student Record Not Found</p>";

return;

}

if(student.payment==="confirmed"){

result.innerHTML=

`

<h2 style="color:green">

✅ Payment Confirmed

</h2>

<p>

Welcome,

<b>${student.name}</b>

</p>

<p>

Digital Pass

will be released

2 days before the event.

</p>

<p style="margin-top:12px; color:#C9A227; font-weight:700;">

Note: Payment confirmation may appear after a 24-hour wait.

</p>

`;

}

else{

result.innerHTML=

`

<h2 style="color:orange">

⏳ Payment Pending

</h2>

<p>

Please contact your coordinator.

</p>

`;

}

});