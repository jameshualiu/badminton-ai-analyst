import modal
import os

app = modal.App("e2-inspector")

# Use a lean image with boto3
image = modal.Image.debian_slim().pip_install("boto3")

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("badminton-ai-secrets")]
)
def list_e2_files():
    import boto3
    s3 = boto3.client(
        's3',
        endpoint_url=os.environ["E2_ENDPOINT"],
        aws_access_key_id=os.environ["E2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["E2_SECRET_ACCESS_KEY"]
    )
    bucket = os.environ["E2_BUCKET_NAME"]
    
    print(f"Listing files in bucket: {bucket}")
    prefix = "uploads/FuHuYchBOwMrF0ohbejJQJr5kIP2/5b173273-15df-4612-ac74-53e374637623/"
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    
    if 'Contents' in response:
        for obj in response['Contents']:
            print(f"🔑 Key found: '{obj['Key']}'")
    else:
        # Try listing with a broader prefix if not found
        print(f"❌ No files found with prefix: {prefix}")
        print("Trying broader prefix: uploads/FuHuYchBOwMrF0ohbejJQJr5kIP2/")
        res2 = s3.list_objects_v2(Bucket=bucket, Prefix="uploads/FuHuYchBOwMrF0ohbejJQJr5kIP2/")
        if 'Contents' in res2:
            for obj in res2['Contents']:
                print(f"  - {obj['Key']}")

if __name__ == "__main__":
    list_e2_files.remote()
